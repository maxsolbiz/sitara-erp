import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import logger from '../utils/logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ status: 401 }); return; }
    const tenant = await prisma.tenant.findUnique({ where: { id: BigInt(req.user.tenantId) } });
    if (!tenant) { res.status(404).json({ status: 404 }); return; }
    res.json({ data: { id: tenant.id.toString(), name: tenant.name, slug: tenant.slug, plan: tenant.plan, status: tenant.status, settings: tenant.settings, createdAt: tenant.createdAt } });
  } catch { logger.error('Tenant detail failed'); res.status(500).json({ status: 500 }); }
});

router.put('/settings', rbacMiddleware('settings.update'), async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ status: 401 }); return; }
    const { name, settings } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (settings !== undefined) data.settings = settings;
    await prisma.tenant.update({ where: { id: BigInt(req.user.tenantId) }, data });
    res.json({ data: { message: 'Tenant updated' } });
  } catch { logger.error('Tenant update failed'); res.status(500).json({ status: 500 }); }
});

router.get('/usage', async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ status: 401 }); return; }
    const tenantId = BigInt(req.user.tenantId);
    const [users, products, sales] = await Promise.all([
      prisma.user.count({ where: { tenantId } }),
      prisma.product.count({ where: { tenantId, deletedAt: null } }),
      prisma.sale.count({ where: { tenantId } }),
    ]);
    res.json({ data: { users, products, sales, storage: 'N/A', apiCalls: 0 } });
  } catch (error: any) { logger.warn('Tenant usage failed', { error: error.message }); res.json({ data: { users: 0, products: 0, sales: 0, storage: 'N/A', apiCalls: 0 } }); }
});

export default router;
