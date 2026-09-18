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

router.get('/', rbacMiddleware('pricing-tiers.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.json({ data: [] }); return; }
    const tiers = await prisma.pricingTier.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: 'asc' },
    });
    res.json({ data: tiers.map((t) => ({ id: t.id.toString(), name: t.name, discountPercent: Number(t.discountPercent), isActive: t.isActive, createdAt: t.createdAt.toISOString() })) });
  } catch { res.json({ data: [] }); }
});

router.post('/', rbacMiddleware('pricing-tiers.create'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.status(401).json({ status: 401, detail: 'No tenant context' }); return; }
    const { name, discountPercent } = req.body;
    if (!name || discountPercent === undefined) { res.status(400).json({ status: 400, detail: 'Name and discount percent required' }); return; }
    const tier = await prisma.pricingTier.create({
      data: { tenantId: ctx.tenantId, name, discountPercent: Number(discountPercent) || 0 },
    });
    res.status(201).json({ data: { id: tier.id.toString(), name: tier.name, discountPercent: Number(tier.discountPercent) } });
  } catch (error: any) { logger.error('Pricing tier create failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.put('/:id', rbacMiddleware('pricing-tiers.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.status(401).json({ status: 401, detail: 'No tenant context' }); return; }
    const { name, discountPercent, isActive } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (discountPercent !== undefined) data.discountPercent = Number(discountPercent);
    if (isActive !== undefined) data.isActive = isActive;
    await prisma.pricingTier.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data });
    res.json({ data: { message: 'Pricing tier updated' } });
  } catch (error: any) { logger.error('Pricing tier update failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.delete('/:id', rbacMiddleware('pricing-tiers.delete'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.status(401).json({ status: 401, detail: 'No tenant context' }); return; }
    await prisma.pricingTier.deleteMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId } });
    res.json({ data: { message: 'Pricing tier deleted' } });
  } catch (error: any) { logger.error('Pricing tier delete failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

export default router;
