import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import { hashPassword, parseIdParam } from '../utils/helpers';
import { logActivity } from '../utils/activity';
import logger from '../utils/logger';

const router = Router();

// Reject malformed numeric IDs with 400 instead of 500/P2025 downstream
// (BigInt('') silently coerces to 0n; BigInt('abc') throws).
router.param('id', (req, res, next, val) => {
  if (parseIdParam(val) === null) {
    res.status(400).json({ status: 400, title: 'Bad Request', detail: 'Invalid id parameter' });
    return;
  }
  next();
});

// GET /users — list all users with roles
router.get('/', rbacMiddleware('users.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const users = await prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, username: true, email: true, fullName: true, isActive: true, isSuperAdmin: true, status: true, lastLogin: true, createdAt: true, roleAssignments: { include: { role: { select: { id: true, name: true, slug: true } } } } },
    });
    res.json({ data: users.map((u) => ({ id: u.id.toString(), username: u.username, email: u.email, fullName: u.fullName, isActive: u.isActive, isSuperAdmin: u.isSuperAdmin, status: u.status, lastLogin: u.lastLogin, createdAt: u.createdAt, roleAssignments: u.roleAssignments.map((ra: any) => ({ id: ra.role.id.toString(), name: ra.role.name, slug: ra.role.slug })) })) });
  } catch { res.json({ data: [] }); }
});

// GET /users/:id — user detail with roles
router.get('/:id', rbacMiddleware('users.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const user = await prisma.user.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      select: { id: true, username: true, email: true, fullName: true, isActive: true, isSuperAdmin: true, status: true, lastLogin: true, createdAt: true, roleAssignments: { include: { role: { select: { id: true, name: true, slug: true, description: true } } } } },
    });
    if (!user) { res.status(404).json({ status: 404, detail: 'User not found' }); return; }
    res.json({ data: { id: user.id.toString(), username: user.username, email: user.email, fullName: user.fullName, isActive: user.isActive, isSuperAdmin: user.isSuperAdmin, status: user.status, lastLogin: user.lastLogin, createdAt: user.createdAt, roleAssignments: user.roleAssignments.map((ra: any) => ({ id: ra.role.id.toString(), name: ra.role.name, slug: ra.role.slug, description: ra.role.description })) } });
  } catch { res.status(500).json({ status: 500, detail: 'Failed to load user' }); }
});

// POST /users — create user
router.post('/', rbacMiddleware('users.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { username, email, password, fullName, roleId } = req.body;
    if (!username || !email || !password || !fullName) { res.status(400).json({ status: 400, detail: 'Username, email, password, and fullName required' }); return; }
    const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }], tenantId: ctx.tenantId } });
    if (existing) { res.status(409).json({ status: 409, detail: 'Username or email already exists' }); return; }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { tenantId: ctx.tenantId, username, email, passwordHash, fullName, isActive: true, status: 'active' },
    });
    logger.info('User created', { userId: user.id.toString(), tenantId: ctx.tenantId.toString() });
    let roleName: string | undefined;
    if (roleId) {
      await prisma.roleUser.upsert({
        where: { userId_roleId: { userId: user.id, roleId: BigInt(roleId) } },
        create: { userId: user.id, roleId: BigInt(roleId) },
        update: {},
      });
      roleName = (await prisma.role.findUnique({ where: { id: BigInt(roleId) }, select: { name: true } }))?.name;
    }
    void logActivity({
      tenantId: ctx.tenantId, userId: req.user ? BigInt(req.user.userId) : undefined,
      action: 'USER_CREATE', entityType: 'user', entityId: user.id,
      description: `User ${username} created`,
      newValues: { username, email, fullName, role: roleName },
      ipAddress: req.ip || '', userAgent: (req.headers['user-agent'] as string) || '',
    });
    res.status(201).json({ data: { id: user.id.toString(), username: user.username, email: user.email } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// PUT /users/:id — update user
router.put('/:id', rbacMiddleware('users.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { fullName, email, isActive } = req.body;
    const data: any = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (email !== undefined) data.email = email;
    if (isActive !== undefined) data.isActive = isActive;
    const before = await prisma.user.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, select: { username: true, isActive: true } });
    await prisma.user.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data });
    if (isActive !== undefined && before && before.isActive !== isActive) {
      const activating = isActive === true;
      void logActivity({
        tenantId: ctx.tenantId, userId: req.user ? BigInt(req.user.userId) : undefined,
        action: activating ? 'USER_REACTIVATE' : 'USER_DEACTIVATE', entityType: 'user', entityId: BigInt(req.params.id),
        description: `User ${before.username} ${activating ? 'reactivated' : 'deactivated'}`,
        oldValues: { isActive: before.isActive }, newValues: { isActive },
        ipAddress: req.ip || '', userAgent: (req.headers['user-agent'] as string) || '',
      });
    }
    res.json({ data: { message: 'User updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// DELETE /users/:id — soft delete
router.delete('/:id', rbacMiddleware('users.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const userId = BigInt(req.params.id);
    const requesterId = req.user ? BigInt(req.user.userId) : BigInt(0);
    if (userId === requesterId) { res.status(400).json({ status: 400, detail: 'Cannot delete yourself' }); return; }
    // Check last admin
    const adminRoles = await prisma.role.findMany({ where: { tenantId: ctx.tenantId, slug: 'admin' } });
    if (adminRoles.length > 0) {
      const adminUsers = await prisma.roleUser.count({ where: { roleId: adminRoles[0].id, user: { isActive: true } } });
      if (adminUsers <= 1) {
        const isAdmin = await prisma.roleUser.findFirst({ where: { userId, roleId: adminRoles[0].id } });
        if (isAdmin) { res.status(400).json({ status: 400, detail: 'Cannot delete the last admin user' }); return; }
      }
    }
    await prisma.user.updateMany({ where: { id: userId, tenantId: ctx.tenantId }, data: { isActive: false, status: 'inactive' } });
    const deleted = await prisma.user.findFirst({ where: { id: userId, tenantId: ctx.tenantId }, select: { username: true } });
    void logActivity({
      tenantId: ctx.tenantId, userId: req.user ? BigInt(req.user.userId) : undefined,
      action: 'USER_DEACTIVATE', entityType: 'user', entityId: userId,
      description: `User ${deleted?.username || userId} deactivated (soft delete)`,
      oldValues: { isActive: true }, newValues: { isActive: false },
      ipAddress: req.ip || '', userAgent: (req.headers['user-agent'] as string) || '',
    });
    res.json({ data: { message: 'User deactivated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// PATCH /users/:id/password — change password
router.patch('/:id/password', rbacMiddleware('users.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { password } = req.body;
    if (!password || password.length < 6) { res.status(400).json({ status: 400, detail: 'Password must be at least 6 characters' }); return; }
    const passwordHash = await hashPassword(password);
    // Admin-initiated reset: force the user to set their own password on next login.
    await prisma.user.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data: { passwordHash, mustChangePassword: true } });
    res.json({ data: { message: 'Password updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// PATCH /users/:id/roles — replace all roles
router.patch('/:id/roles', rbacMiddleware('users.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const userId = BigInt(req.params.id);
    const { roleIds } = req.body;
    if (!Array.isArray(roleIds)) { res.status(400).json({ status: 400, detail: 'roleIds array required' }); return; }
    const beforeLinks = await prisma.roleUser.findMany({ where: { userId }, include: { role: { select: { slug: true } } } });
    const beforeSlugs = beforeLinks.map((l) => l.role.slug);
    // Remove existing
    await prisma.roleUser.deleteMany({ where: { userId } });
    // Add new
    for (const rid of roleIds) {
      await prisma.roleUser.create({ data: { userId, roleId: BigInt(rid) } });
    }
    const afterRoles = await prisma.role.findMany({ where: { id: { in: roleIds.map((r: any) => BigInt(r)) } }, select: { slug: true } });
    const afterSlugs = afterRoles.map((r) => r.slug);
    const target = await prisma.user.findFirst({ where: { id: userId, tenantId: ctx.tenantId }, select: { username: true } });
    void logActivity({
      tenantId: ctx.tenantId, userId: req.user ? BigInt(req.user.userId) : undefined,
      action: 'USER_ROLE_ASSIGN', entityType: 'user', entityId: userId,
      description: `Roles updated for ${target?.username || userId}`,
      oldValues: { roles: beforeSlugs }, newValues: { roles: afterSlugs },
      ipAddress: req.ip || '', userAgent: (req.headers['user-agent'] as string) || '',
    });
    res.json({ data: { message: 'Roles updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

export default router;
