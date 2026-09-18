import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import { parseIdParam } from '../utils/helpers';
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

function mapCategory(c: any, productCount?: number) {
  return { id: c.id.toString(), name: c.name, slug: c.slug, description: c.description, parentId: c.parentId?.toString() || null, sortOrder: c.sortOrder, isActive: c.isActive, productCount: productCount ?? 0, createdAt: c.createdAt, updatedAt: c.updatedAt };
}

function genSlug(name: string): string { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category'; }

router.get('/', rbacMiddleware('products.categories.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const all = req.query.all === 'true';
    const where: any = { tenantId: ctx.tenantId };
    if (!all) where.isActive = true;
    const categories = await prisma.productCategory.findMany({ where, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { products: true } } } });
    res.json({ data: categories.map((c) => mapCategory(c, c._count.products)) });
  } catch { res.json({ data: [] }); }
});

router.get('/:id', rbacMiddleware('products.categories.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const c = await prisma.productCategory.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, include: { _count: { select: { products: true } }, children: true } });
    if (!c) { res.status(404).json({ status: 404 }); return; }
    res.json({ data: mapCategory(c, c._count.products) });
  } catch { logger.error('Category detail failed'); res.status(500).json({ status: 500 }); }
});

router.post('/', rbacMiddleware('products.categories.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { name, parentId, description, sortOrder } = req.body;
    if (!name) { res.status(400).json({ status: 400, detail: 'Name is required' }); return; }
    const existing = await prisma.productCategory.findFirst({ where: { tenantId: ctx.tenantId, name: { equals: name, mode: 'insensitive' } } });
    if (existing) { res.status(409).json({ status: 409, detail: 'Category with this name already exists' }); return; }
    if (parentId) {
      const parent = await prisma.productCategory.findFirst({ where: { id: BigInt(parentId), tenantId: ctx.tenantId } });
      if (!parent) { res.status(400).json({ status: 400, detail: 'Parent category not found' }); return; }
    }
    const slug = genSlug(name);
    const c = await prisma.productCategory.create({ data: { tenantId: ctx.tenantId, name, slug, description: description || null, parentId: parentId ? BigInt(parentId) : null, sortOrder: sortOrder || 0 } });
    res.status(201).json({ data: mapCategory(c) });
  } catch (error: any) { logger.error('Category create failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.put('/:id', rbacMiddleware('products.categories.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { name, parentId, description, sortOrder, isActive } = req.body;
    const data: any = {};
    if (name !== undefined) { data.name = name; data.slug = genSlug(name); }
    if (description !== undefined) data.description = description;
    if (parentId !== undefined) {
      if (parentId) { const p = await prisma.productCategory.findFirst({ where: { id: BigInt(parentId), tenantId: ctx.tenantId } }); if (!p) { res.status(400).json({ status: 400, detail: 'Parent not found' }); return; } }
      data.parentId = parentId ? BigInt(parentId) : null;
    }
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (isActive !== undefined) data.isActive = isActive;
    await prisma.productCategory.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data });
    res.json({ data: { message: 'Category updated' } });
  } catch (error: any) { logger.error('Category update failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.delete('/:id', rbacMiddleware('products.categories.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const id = BigInt(req.params.id);
    const cat = await prisma.productCategory.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { _count: { select: { products: true } }, children: true } });
    if (!cat) { res.status(404).json({ status: 404 }); return; }
    if (cat.children.length > 0) { res.status(409).json({ status: 409, detail: 'Category has subcategories. Move or delete them first.' }); return; }
    if (cat._count.products > 0) { res.status(409).json({ status: 409, detail: `Cannot delete category with ${cat._count.products} product(s) assigned.` }); return; }
    await prisma.productCategory.delete({ where: { id } });
    res.json({ data: { message: 'Category deleted' } });
  } catch (error: any) { logger.error('Category delete failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.patch('/:id/toggle', rbacMiddleware('products.categories.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const cat = await prisma.productCategory.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId } });
    if (!cat) { res.status(404).json({ status: 404 }); return; }
    await prisma.productCategory.updateMany({ where: { id: cat.id, tenantId: ctx.tenantId }, data: { isActive: !cat.isActive } });
    res.json({ data: { message: `Category ${cat.isActive ? 'deactivated' : 'activated'}` } });
  } catch (error: any) { logger.error('Category toggle failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

export default router;
