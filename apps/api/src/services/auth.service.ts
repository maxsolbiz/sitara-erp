import prisma from '../lib/prisma';
import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken, verifyRefreshToken, verifyAccessToken } from '../utils/helpers';
import { logActivity } from '../utils/activity';
import { getRedis } from '../lib/redis';
import logger from '../utils/logger';

export class AuthService {
  async registerTenant(tenantName: string, slug: string, email: string, password: string, fullName: string) {
    const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
    if (existingTenant) {
      throw new Error('TENANT_EXISTS');
    }

    const existingUser = await prisma.user.findFirst({
      where: { email, tenant: { slug } },
    });
    if (existingUser) {
      throw new Error('EMAIL_EXISTS');
    }

    const tenant = await prisma.tenant.create({
      data: {
        name: tenantName,
        slug,
        plan: 'starter',
        status: 'trial',
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        settings: {
          currency: 'PKR',
          fiscalYearStart: '07-01',
          timezone: 'Asia/Karachi',
        },
      },
    });

    // Seed default Chart of Accounts for new tenant
    const defaultAccounts = [
      { code: '1000', name: 'Cash on Hand', type: 'ASSET', isBank: true },
      { code: '1010', name: 'Bank Account', type: 'ASSET', isBank: true },
      { code: '1100', name: 'Accounts Receivable', type: 'ASSET', isBank: false },
      { code: '1200', name: 'Inventory', type: 'ASSET', isBank: false },
      { code: '1300', name: 'Prepaid Expenses', type: 'ASSET', isBank: false },
      { code: '1500', name: 'Fixed Assets', type: 'ASSET', isBank: false },
      { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', isBank: false },
      { code: '2100', name: 'Sales Tax Payable', type: 'LIABILITY', isBank: false },
      { code: '2200', name: 'Accrued Expenses', type: 'LIABILITY', isBank: false },
      { code: '3000', name: 'Owner Equity', type: 'EQUITY', isBank: false },
      { code: '3100', name: 'Retained Earnings', type: 'EQUITY', isBank: false },
      { code: '4000', name: 'Sales Revenue', type: 'REVENUE', isBank: false },
      { code: '4100', name: 'Sales Returns', type: 'REVENUE', isBank: false },
      { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE', isBank: false },
      { code: '6000', name: 'Rent Expense', type: 'EXPENSE', isBank: false },
      { code: '6100', name: 'Utilities Expense', type: 'EXPENSE', isBank: false },
      { code: '6200', name: 'Salaries Expense', type: 'EXPENSE', isBank: false },
      { code: '6300', name: 'Advertising Expense', type: 'EXPENSE', isBank: false },
      { code: '6400', name: 'Office Supplies', type: 'EXPENSE', isBank: false },
      { code: '6500', name: 'Miscellaneous Expense', type: 'EXPENSE', isBank: false },
    ];
    for (const acct of defaultAccounts) {
      await prisma.chartOfAccount.create({
        data: { tenantId: tenant.id, accountCode: acct.code, accountName: acct.name, accountType: acct.type, isBankAccount: acct.isBank },
      });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        username: email.split('@')[0],
        email,
        passwordHash,
        fullName,
        isSuperAdmin: true,
        status: 'active',
      },
    });

    // Seed default roles and permissions for new tenant
    const DEFAULT_PERMISSIONS: Record<string, string[]> = {
      'products': ['products.view', 'products.create', 'products.update', 'products.delete', 'products.import', 'products.export', 'products.categories.manage'],
      'pos': ['pos.access', 'pos.sales.create', 'pos.sales.hold', 'pos.sales.void', 'pos.returns.create', 'pos.sales.view', 'pos.returns.process', 'pos.daily.close'],
      'sales': ['sales.view', 'sales.cancel', 'sales.void', 'sales.export', 'sales.returns.view', 'sales.returns.approve', 'sales.email', 'sales.returns.create'],
      'accounting': ['accounting.view', 'accounting.journals.create', 'accounting.accounts.manage', 'accounting.reports', 'accounting.journals.reverse'],
      'customers': ['customers.view', 'customers.create', 'customers.update', 'customers.delete', 'customers.export', 'customers.payments'],
      'vendors': ['vendors.view', 'vendors.create', 'vendors.update', 'vendors.delete', 'vendors.export', 'vendors.payments'],
      'purchases': ['purchases.view', 'purchases.create', 'purchases.update', 'purchases.receive', 'purchases.returns'],
      'inventory': ['inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.movements', 'inventory.adjustments'],
      'reports': ['reports.view', 'reports.sales', 'reports.purchases', 'reports.inventory', 'reports.financial', 'reports.export'],
      'settings': ['settings.view', 'settings.company', 'settings.pos', 'settings.notifications', 'settings.backup', 'settings.update'],
      'users': ['users.view', 'users.create', 'users.update', 'users.delete', 'users.roles.manage', 'users.manage'],
      'roles': ['roles.view', 'roles.create', 'roles.update', 'roles.delete', 'roles.permissions.manage', 'rbac.manage'],
      'pricing-tiers': ['pricing-tiers.view', 'pricing-tiers.create', 'pricing-tiers.update', 'pricing-tiers.delete'],
      'expenses': ['expenses.view', 'expenses.create', 'expenses.update', 'expenses.delete', 'expenses.approve', 'expenses.pay', 'expenses.categories.manage'],
      'loans': ['loans.view', 'loans.manage'],
      'notifications': ['notifications.view'],
    };

    const allPermSlugs: string[] = [];
    for (const p of Object.values(DEFAULT_PERMISSIONS)) allPermSlugs.push(...p);

    const permRecords: Record<string, bigint> = {};
    for (const slug of allPermSlugs) {
      const [module] = slug.split('.');
      const perm = await prisma.permission.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug } },
        update: {},
        create: { tenantId: tenant.id, name: slug.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), slug, module },
      });
      permRecords[slug] = perm.id;
    }

    const roleDefs = [
      { name: 'Admin', slug: 'admin', description: 'Full system access with all permissions', permissions: allPermSlugs },
      { name: 'Manager', slug: 'manager', description: 'Can manage inventory, purchases, customers, and view reports', permissions: [...DEFAULT_PERMISSIONS.products, ...DEFAULT_PERMISSIONS.sales, ...DEFAULT_PERMISSIONS.customers, ...DEFAULT_PERMISSIONS.vendors, ...DEFAULT_PERMISSIONS.purchases, ...DEFAULT_PERMISSIONS.inventory, ...DEFAULT_PERMISSIONS.reports, ...DEFAULT_PERMISSIONS.loans, ...DEFAULT_PERMISSIONS.settings, ...DEFAULT_PERMISSIONS.notifications, 'expenses.approve', 'expenses.pay'] },
      { name: 'Cashier', slug: 'cashier', description: 'Can operate POS and view sales', permissions: [...DEFAULT_PERMISSIONS.pos, ...DEFAULT_PERMISSIONS.notifications, 'sales.view', 'customers.view', 'customers.create'] },
      { name: 'Accountant', slug: 'accountant', description: 'Can manage accounting, expenses, and financial reports', permissions: [...DEFAULT_PERMISSIONS.accounting, ...DEFAULT_PERMISSIONS.reports, ...DEFAULT_PERMISSIONS.loans, ...DEFAULT_PERMISSIONS.notifications, 'expenses.view', 'expenses.create', 'expenses.approve', 'expenses.pay', 'customers.view', 'customers.payments', 'vendors.view', 'vendors.payments'] },
    ];

    for (const rd of roleDefs) {
      const role = await prisma.role.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: rd.slug } },
        update: { name: rd.name, description: rd.description },
        create: { tenantId: tenant.id, name: rd.name, slug: rd.slug, description: rd.description, isSystem: true },
      });
      for (const slug of rd.permissions) {
        const pid = permRecords[slug];
        if (pid) {
          await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId: pid } },
            update: {},
            create: { roleId: role.id, permissionId: pid },
          });
        }
      }
    }

    // Assign admin role to the new user
    const adminRole = await prisma.role.findFirst({
      where: { tenantId: tenant.id, slug: 'admin' },
    });
    if (adminRole) {
      await prisma.roleUser.create({
        data: { userId: user.id, roleId: adminRole.id },
      });
    }

    // Create default financial year for new tenant (Pakistan FY: July 1 — June 30)
    const now = new Date();
    const y = now.getFullYear();
    const fyStart = new Date(y, 6, 1);
    const fyEnd = new Date(y + 1, 5, 30);
    await prisma.financialYear.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: `FY ${y}-${(y + 1).toString().slice(2)}` } },
      update: {},
      create: { tenantId: tenant.id, name: `FY ${y}-${(y + 1).toString().slice(2)}`, startDate: fyStart, endDate: fyEnd, status: 'OPEN' },
    });

    // Create walk-in customer for POS
    await prisma.customer.upsert({
      where: { tenantId_customerCode: { tenantId: tenant.id, customerCode: 'WALKIN' } },
      update: {},
      create: {
        tenantId: tenant.id, customerCode: 'WALKIN', fullName: 'Walk-in Customer',
        isActive: true, creditLimit: 0, currentBalance: 0,
      },
    });

    // Create default warehouse if none exists
    const existingWarehouse = await prisma.warehouse.findFirst({ where: { tenantId: tenant.id } });
    if (!existingWarehouse) {
      await prisma.warehouse.create({
        data: { tenantId: tenant.id, code: 'MAIN', name: 'Main Warehouse', isDefault: true, isActive: true },
      });
    }

    logger.info('Tenant registered', { tenantId: tenant.id.toString(), slug, email });
    return { tenant, user };
  }

  async login(email: string, password: string, meta?: { ipAddress?: string; userAgent?: string }) {
    const user = await prisma.user.findFirst({
      where: { email },
      include: { tenant: { select: { id: true, name: true, slug: true, status: true } } },
    });

    if (!user) {
      // No tenant attributable — helper no-ops without one; still call for intent.
      void logActivity({ action: 'LOGIN_FAILED', entityType: 'user', description: `Failed login attempt for ${email}`, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent });
      throw new Error('INVALID_CREDENTIALS');
    }

    if (!user.isActive || user.status !== 'active') {
      throw new Error('ACCOUNT_INACTIVE');
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new Error('ACCOUNT_LOCKED');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: { increment: 1 } },
      });
      void logActivity({ tenantId: user.tenantId, userId: user.id, action: 'LOGIN_FAILED', entityType: 'user', entityId: user.id, description: `Failed login attempt for ${email}`, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent });

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      if (updated && updated.loginAttempts >= 5) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
        });
        throw new Error('ACCOUNT_LOCKED');
      }

      throw new Error('INVALID_CREDENTIALS');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLogin: new Date(),
      },
    });

    const accessToken = generateAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
    });

    const redis = getRedis();
    await redis.set(
      `refresh:${user.id}`,
      refreshToken,
      'EX',
      7 * 24 * 60 * 60
    );

    // Session tracking (additive): record this login so the Active Sessions
    // list and terminate endpoint have real rows. Must never break login —
    // a failed insert only logs a warning. Not enforced anywhere yet.
    try {
      const decoded = verifyAccessToken(accessToken);
      if (decoded?.jti) {
        await prisma.userSession.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            sessionToken: decoded.jti,
            ipAddress: meta?.ipAddress || '',
            userAgent: meta?.userAgent || '',
            // Derived from the actual token exp claim — never a hardcoded TTL,
            // so JWT_EXPIRES_IN changes can't desync row vs token lifetimes.
            expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 15 * 60 * 1000),
            isActive: true,
          },
        });
      }
    } catch (e: any) {
      logger.warn('Session row creation failed (login still succeeds)', { error: e.message });
    }

    void logActivity({ tenantId: user.tenantId, userId: user.id, action: 'LOGIN', entityType: 'user', entityId: user.id, description: `User ${user.username} logged in`, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id.toString(),
        email: user.email,
        fullName: user.fullName,
        slug: user.tenant.slug,
        tenantName: user.tenant.name,
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }

    const redis = getRedis();
    const stored = await redis.get(`refresh:${payload.userId}`);
    if (stored !== refreshToken) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }

    const user = await prisma.user.findUnique({
      where: { id: BigInt(payload.userId) },
      include: { tenant: { select: { id: true, slug: true } } },
    });

    if (!user || !user.isActive) {
      throw new Error('USER_INACTIVE');
    }

    // A refresh must never resurrect a terminated session: only rotate a
    // session row that is still active. No active rows → the session was
    // terminated (or never tracked) → refuse, forcing a fresh login.
    // Most-recent-active wins because refresh tokens are single-slot per
    // user (refresh:{userId}) — only one refresh token is valid at a time.
    const activeRow = await prisma.userSession.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (!activeRow) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }

    const newAccessToken = generateAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
    });

    const newRefreshToken = generateRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
    });

    await redis.set(
      `refresh:${user.id}`,
      newRefreshToken,
      'EX',
      7 * 24 * 60 * 60
    );

    // Rotate the session row onto the new access-token jti so the row keeps
    // tracking the live token. Must not break refresh — warn only on failure.
    try {
      const decoded = verifyAccessToken(newAccessToken);
      if (decoded?.jti) {
        await prisma.userSession.update({
          where: { id: activeRow.id },
          data: {
            sessionToken: decoded.jti,
            expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 15 * 60 * 1000),
            lastActivity: new Date(),
          },
        });
      }
    } catch (e: any) {
      logger.warn('Session row rotation failed (refresh still succeeds)', { error: e.message });
    }

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: bigint, jti?: string, meta?: { ipAddress?: string; userAgent?: string }) {
    const redis = getRedis();
    await redis.del(`refresh:${userId}`);
    // Deactivate this session's row so the access token is rejected going
    // forward (rowless/legacy tokens keep working — see authMiddleware).
    if (jti) {
      await prisma.userSession.updateMany({ where: { sessionToken: jti, userId }, data: { isActive: false } }).catch(() => {});
    }
    // Tenant resolves from request context (logout route is authenticated).
    void logActivity({ userId, action: 'LOGOUT', entityType: 'user', entityId: userId, description: 'User logged out', ipAddress: meta?.ipAddress, userAgent: meta?.userAgent });
  }
}

export const authService = new AuthService();
