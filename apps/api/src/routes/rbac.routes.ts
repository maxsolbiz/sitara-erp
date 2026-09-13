import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import { parseIdParam } from '../utils/helpers';
import logger from '../utils/logger';

const router = Router();

// Reject malformed numeric IDs with 400 instead of 500/P2025 downstream
// (BigInt('') silently coerces to 0n; BigInt('abc') throws).
for (const name of ['id', 'userId']) {
  router.param(name, (req, res, next, val) => {
    if (parseIdParam(val) === null) {
      res.status(400).json({ status: 400, title: 'Bad Request', detail: 'Invalid id parameter' });
      return;
    }
    next();
  });
}

// GET /roles — list all roles with permission counts
router.get('/roles', rbacMiddleware('rbac.manage'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const roles = await prisma.role.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { permissions: true, users: true } }, permissions: { include: { permission: { select: { slug: true, module: true } } } } },
    });
    res.json({ data: roles.map((r) => ({ id: r.id.toString(), name: r.name, slug: r.slug, description: r.description, isSystem: r.isSystem, userCount: r._count.users, permissionCount: r._count.permissions, permissions: r.permissions.map((p) => ({ slug: p.permission.slug, module: p.permission.module })) })) });
  } catch { res.json({ data: [] }); }
});

// GET /roles/:id — role detail
router.get('/roles/:id', rbacMiddleware('rbac.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const role = await prisma.role.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      include: { users: { include: { user: { select: { id: true, fullName: true, email: true } } } }, permissions: { include: { permission: { select: { id: true, slug: true, name: true, module: true } } } } },
    });
    if (!role) { res.status(404).json({ status: 404, detail: 'Role not found' }); return; }
    res.json({ data: { id: role.id.toString(), name: role.name, slug: role.slug, description: role.description, isSystem: role.isSystem, users: role.users.map((u) => ({ id: u.user.id.toString(), fullName: u.user.fullName, email: u.user.email })), permissions: role.permissions.map((p) => ({ id: p.permission.id.toString(), slug: p.permission.slug, name: p.permission.name, module: p.permission.module })) } });
  } catch { res.status(500).json({ status: 500, detail: 'Failed to load role' }); }
});

// POST /roles — create role
router.post('/roles', rbacMiddleware('rbac.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { name, description, permissionIds } = req.body;
    if (!name) { res.status(400).json({ status: 400, detail: 'Name is required' }); return; }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const role = await prisma.role.create({ data: { tenantId: ctx.tenantId, name, slug, description: description || null, isSystem: false } });
    if (permissionIds && Array.isArray(permissionIds)) {
      for (const pid of permissionIds) {
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: BigInt(pid) } });
      }
    }
    res.status(201).json({ data: { id: role.id.toString(), name, slug } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// PUT /roles/:id — update role
router.put('/roles/:id', rbacMiddleware('rbac.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { name, description } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    await prisma.role.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data });
    res.json({ data: { message: 'Role updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// DELETE /roles/:id — delete role
router.delete('/roles/:id', rbacMiddleware('rbac.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const role = await prisma.role.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId } });
    if (!role) { res.status(404).json({ status: 404, detail: 'Role not found' }); return; }
    if (role.isSystem) { res.status(400).json({ status: 400, detail: 'Cannot delete built-in roles' }); return; }
    const userCount = await prisma.roleUser.count({ where: { roleId: role.id } });
    if (userCount > 0) { res.status(400).json({ status: 400, detail: `Cannot delete role with ${userCount} assigned user(s)` }); return; }
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.role.delete({ where: { id: role.id } });
    res.json({ data: { message: 'Role deleted' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// PATCH /roles/:id/permissions — replace all permissions
router.patch('/roles/:id/permissions', rbacMiddleware('rbac.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const roleId = BigInt(req.params.id);
    const { permissionIds } = req.body;
    if (!Array.isArray(permissionIds)) { res.status(400).json({ status: 400, detail: 'permissionIds array required' }); return; }
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    for (const pid of permissionIds) {
      await prisma.rolePermission.create({ data: { roleId, permissionId: BigInt(pid) } });
    }
    logger.info('Role permissions updated', { roleId: req.params.id, permissionCount: permissionIds.length });
    res.json({ data: { message: 'Permissions updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// GET /permissions — list all permissions grouped by module
router.get('/permissions', rbacMiddleware('rbac.manage'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const perms = await prisma.permission.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ module: 'asc' }, { slug: 'asc' }] });
    const grouped: Record<string, any[]> = {};
    for (const p of perms) {
      const mod = p.module || 'general';
      if (!grouped[mod]) grouped[mod] = [];
      grouped[mod].push({ id: p.id.toString(), slug: p.slug, name: p.name });
    }
    res.json({ data: grouped });
  } catch { res.json({ data: {} }); }
});

// POST /roles/:id/users/:userId — assign role to user
router.post('/roles/:id/users/:userId', rbacMiddleware('rbac.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const roleId = BigInt(req.params.id);
    const userId = BigInt(req.params.userId);
    await prisma.roleUser.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
    res.json({ data: { message: 'Role assigned' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// DELETE /roles/:id/users/:userId — remove role from user
router.delete('/roles/:id/users/:userId', rbacMiddleware('rbac.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const roleId = BigInt(req.params.id);
    const userId = BigInt(req.params.userId);
    // Prevent removing last admin
    const role = await prisma.role.findFirst({ where: { id: roleId, tenantId: ctx.tenantId } });
    if (role?.slug === 'admin') {
      const adminCount = await prisma.roleUser.count({ where: { roleId, user: { isActive: true } } });
      if (adminCount <= 1) { res.status(400).json({ status: 400, detail: 'Cannot remove the last admin role' }); return; }
    }
    await prisma.roleUser.deleteMany({ where: { userId, roleId } });
    res.json({ data: { message: 'Role removed' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

export default router;
