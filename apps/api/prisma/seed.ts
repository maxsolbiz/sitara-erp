import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  'products': ['products.view', 'products.create', 'products.update', 'products.delete', 'products.import', 'products.export'],
  'pos': ['pos.access', 'pos.sales.create', 'pos.sales.hold', 'pos.sales.void', 'pos.returns.create', 'pos.daily.close'],
  'sales': ['sales.view', 'sales.cancel', 'sales.export', 'sales.returns.view', 'sales.returns.approve'],
  'customers': ['customers.view', 'customers.create', 'customers.update', 'customers.delete', 'customers.export'],
  'vendors': ['vendors.view', 'vendors.create', 'vendors.update', 'vendors.delete', 'vendors.export'],
  'purchases': ['purchases.view', 'purchases.create', 'purchases.update', 'purchases.receive', 'purchases.returns'],
  'inventory': ['inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.movements'],
  'accounting': ['accounting.view', 'accounting.journals.create', 'accounting.accounts.manage', 'accounting.reports'],
  'reports': ['reports.view', 'reports.sales', 'reports.purchases', 'reports.inventory', 'reports.financial', 'reports.export'],
  'settings': ['settings.view', 'settings.company', 'settings.pos', 'settings.notifications', 'settings.backup'],
  'users': ['users.view', 'users.create', 'users.update', 'users.delete', 'users.roles.manage'],
  'roles': ['roles.view', 'roles.create', 'roles.update', 'roles.delete', 'roles.permissions.manage'],
};

const DEFAULT_ROLES = [
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Full system access with all permissions',
    permissions: Object.values(DEFAULT_PERMISSIONS).flat(),
  },
  {
    name: 'Manager',
    slug: 'manager',
    description: 'Can manage inventory, purchases, customers, and view reports',
    permissions: [
      ...DEFAULT_PERMISSIONS.products,
      ...DEFAULT_PERMISSIONS.sales,
      ...DEFAULT_PERMISSIONS.customers,
      ...DEFAULT_PERMISSIONS.vendors,
      ...DEFAULT_PERMISSIONS.purchases,
      ...DEFAULT_PERMISSIONS.inventory,
      ...DEFAULT_PERMISSIONS.reports,
    ],
  },
  {
    name: 'Cashier',
    slug: 'cashier',
    description: 'Can operate POS and view sales',
    permissions: [
      ...DEFAULT_PERMISSIONS.pos,
      'sales.view',
      'customers.view',
      'customers.create',
    ],
  },
  {
    name: 'Accountant',
    slug: 'accountant',
    description: 'Can manage accounting, expenses, and financial reports',
    permissions: [
      ...DEFAULT_PERMISSIONS.accounting,
      ...DEFAULT_PERMISSIONS.reports,
      'expenses.view', 'expenses.create', 'expenses.approve',
      'customers.view', 'vendors.view',
    ],
  },
  {
    // Scoped e2e fixture (used by costprice + pos specs): product browsing
    // without cost data, walk-in POS sales. Only what the tests assert —
    // deliberately no products.export/create/update/delete/import and no
    // hold/void/returns/close, so the tests stay a meaningful signal.
    name: 'Viewer',
    slug: 'viewer',
    description: 'E2E fixture: browse products (no cost data), walk-in POS sales',
    permissions: [
      'products.view',
      'pos.access',
      'pos.sales.create',
      'sales.view',
      'customers.view',
    ],
  },
];

const DEFAULT_CHART_OF_ACCOUNTS = [
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

async function main() {
  console.log('Seeding database...');

  const adminPassword = await bcrypt.hash('admin123', 12);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: { name: 'Demo Company' },
    create: {
      name: 'Demo Company',
      slug: 'demo',
      plan: 'starter',
      status: 'active',
      settings: {
        currency: 'PKR',
        fiscalYearStart: '07-01',
        timezone: 'Asia/Karachi',
      },
    },
  });
  console.log(`Tenant: ${tenant.slug} (${tenant.id})`);

  const allPermissions: string[] = [];
  for (const modulePermissions of Object.values(DEFAULT_PERMISSIONS)) {
    allPermissions.push(...modulePermissions);
  }
  allPermissions.push('expenses.view', 'expenses.create', 'expenses.approve');

  const permissionRecords: Record<string, bigint> = {};
  for (const permSlug of allPermissions) {
    const [module] = permSlug.split('.');
    const perm = await prisma.permission.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: permSlug } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: permSlug.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        slug: permSlug,
        module,
      },
    });
    permissionRecords[permSlug] = perm.id;
  }
  console.log(`Permissions: ${Object.keys(permissionRecords).length}`);

  const roleRecords: Record<string, bigint> = {};
  for (const roleData of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: roleData.slug } },
      update: { name: roleData.name, description: roleData.description },
      create: {
        tenantId: tenant.id,
        name: roleData.name,
        slug: roleData.slug,
        description: roleData.description,
        isSystem: true,
      },
    });
    roleRecords[roleData.slug] = role.id;

    for (const permSlug of roleData.permissions) {
      const permId = permissionRecords[permSlug];
      if (permId) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permId } },
          update: {},
          create: { roleId: role.id, permissionId: permId },
        });
      }
    }
  }
  console.log(`Roles: ${Object.keys(roleRecords).length}`);

  const adminUser = await prisma.user.upsert({
    where: { tenantId_username: { tenantId: tenant.id, username: 'admin' } },
    update: { fullName: 'System Admin' },
    create: {
      tenantId: tenant.id,
      username: 'admin',
      email: 'admin@demo.com',
      passwordHash: adminPassword,
      fullName: 'System Admin',
      isSuperAdmin: true,
      status: 'active',
    },
  });
  console.log(`Admin user: ${adminUser.email}`);

  const adminRoleId = roleRecords['admin'];
  if (adminRoleId) {
    await prisma.roleUser.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: adminRoleId } },
      update: {},
      create: { userId: adminUser.id, roleId: adminRoleId },
    });
  }

  // E2E fixture account (costprice + pos specs log in as this user).
  // Upsert unconditionally resets it to known-good state, so a failed
  // test run can never leave it poisoned (wrong hash, must-change flag,
  // lockout) for the next run.
  const viewerPassword = await bcrypt.hash('e2eviewer123', 12);
  const viewerUser = await prisma.user.upsert({
    where: { tenantId_username: { tenantId: tenant.id, username: 'e2eviewer' } },
    update: {
      email: 'e2eviewer@demo.com',
      passwordHash: viewerPassword,
      fullName: 'E2E Viewer',
      isActive: true,
      status: 'active',
      mustChangePassword: false,
      loginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      tenantId: tenant.id,
      username: 'e2eviewer',
      email: 'e2eviewer@demo.com',
      passwordHash: viewerPassword,
      fullName: 'E2E Viewer',
      isSuperAdmin: false,
      isActive: true,
      status: 'active',
      mustChangePassword: false,
    },
  });
  console.log(`Viewer user: ${viewerUser.email}`);

  const viewerRoleId = roleRecords['viewer'];
  if (viewerRoleId) {
    await prisma.roleUser.upsert({
      where: { userId_roleId: { userId: viewerUser.id, roleId: viewerRoleId } },
      update: {},
      create: { userId: viewerUser.id, roleId: viewerRoleId },
    });
  }

  for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
    await prisma.chartOfAccount.upsert({
      where: { tenantId_accountCode: { tenantId: tenant.id, accountCode: account.code } },
      update: { accountName: account.name },
      create: {
        tenantId: tenant.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        isBankAccount: account.isBank,
      },
    });
  }
  console.log(`Chart of accounts: ${DEFAULT_CHART_OF_ACCOUNTS.length}`);

  console.log('Seed complete!');
  console.log('  Demo tenant: demo (subdomain: demo.sitarapurse.com)');
  console.log('  Admin login: admin@demo.com / admin123');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
