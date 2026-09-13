import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const logs = await prisma.returnProcessingLog.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ data: logs.map((l: any) => ({ id: l.id.toString(), saleId: l.saleId.toString(), returnNumber: l.returnNumber, status: l.status, errorMessage: l.errorMessage, createdAt: l.createdAt })) });
  } catch { res.json({ data: [] }); }
});

router.get('/failed', async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const logs = await prisma.returnProcessingLog.findMany({
      where: { tenantId: ctx.tenantId, status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ data: logs.map((l: any) => ({ id: l.id.toString(), saleId: l.saleId.toString(), returnNumber: l.returnNumber, errorMessage: l.errorMessage, createdAt: l.createdAt })) });
  } catch { res.json({ data: [] }); }
});

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: {} }); return; }
    const [total, success, failed] = await Promise.all([
      prisma.returnProcessingLog.count({ where: { tenantId: ctx.tenantId } }),
      prisma.returnProcessingLog.count({ where: { tenantId: ctx.tenantId, status: 'SUCCESS' } }),
      prisma.returnProcessingLog.count({ where: { tenantId: ctx.tenantId, status: 'FAILED' } }),
    ]);
    res.json({ data: { total, success, failed } });
  } catch { res.json({ data: {} }); }
});

export default router;
