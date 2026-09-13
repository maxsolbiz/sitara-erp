import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { dashboardService } from '../services/dashboard.service';
import { rbacMiddleware } from '../middleware/rbac';
import logger from '../utils/logger';

const router = Router();

router.get('/stats', rbacMiddleware('reports.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: {} }); return; }
    const stats = await dashboardService.getStats();
    const [totalReceivable, totalPayable] = await Promise.all([
      prisma.customer.aggregate({ where: { tenantId: ctx.tenantId }, _sum: { currentBalance: true } }),
      prisma.vendor.aggregate({ where: { tenantId: ctx.tenantId, deletedAt: null }, _sum: { currentBalance: true } }),
    ]);
    res.json({ data: { ...stats, accountsReceivable: Number(totalReceivable._sum.currentBalance || 0), accountsPayable: Number(totalPayable._sum.currentBalance || 0) } });
  } catch (error: any) {
    logger.error('Dashboard stats failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Error', detail: 'Failed to load dashboard stats' });
  }
});

router.get('/recent-sales', rbacMiddleware('reports.view'), async (_req: Request, res: Response) => {
  try { const sales = await dashboardService.getRecentSales(); res.json({ data: sales }); }
  catch { res.json({ data: [] }); }
});

router.get('/low-stock', rbacMiddleware('reports.view'), async (_req: Request, res: Response) => {
  try { const items = await dashboardService.getLowStockItems(); res.json({ data: items }); }
  catch { res.json({ data: [] }); }
});

router.get('/sales-chart', rbacMiddleware('reports.view'), async (_req: Request, res: Response) => {
  try { const data = await dashboardService.getSalesChart(); res.json({ data }); }
  catch { res.json({ data: [] }); }
});

router.get('/top-products', rbacMiddleware('reports.view'), async (_req: Request, res: Response) => {
  try { const data = await dashboardService.getTopProducts(); res.json({ data }); }
  catch { res.json({ data: [] }); }
});

router.get('/payment-breakdown', rbacMiddleware('reports.view'), async (_req: Request, res: Response) => {
  try { const data = await dashboardService.getPaymentBreakdown(); res.json({ data }); }
  catch { res.json({ data: [] }); }
});

router.get('/pending-actions', rbacMiddleware('reports.view'), async (_req: Request, res: Response) => {
  try { const data = await dashboardService.getPendingActions(); res.json({ data }); }
  catch { res.json({ data: {} }); }
});

export default router;
