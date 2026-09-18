import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { rbacMiddleware } from '../middleware/rbac';
import { tenantMiddleware } from '../middleware/tenant';
import { generateProductDescription, generateSalesSummary } from '../services/ai.service';
import logger from '../utils/logger';

const router = Router();

router.post('/product-description', authMiddleware, tenantMiddleware, rbacMiddleware('products.create'), async (req: Request, res: Response) => {
  try {
    const { name, category, price } = req.body;
    if (!name) { res.status(400).json({ success: false, error: 'name required' }); return; }
    const description = await generateProductDescription(name, category || '', price || 0);
    res.json({ success: true, data: { description } });
  } catch (error: any) {
    logger.error('AI description failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/sales-summary', authMiddleware, tenantMiddleware, rbacMiddleware('reports.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ success: false }); return; }
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const [salesCount, revenueAgg] = await Promise.all([
      prisma.sale.count({ where: { tenantId: ctx.tenantId, createdAt: { gte: monthStart }, status: { not: 'CANCELLED' } } }),
      prisma.sale.aggregate({ where: { tenantId: ctx.tenantId, createdAt: { gte: monthStart }, status: { not: 'CANCELLED' } }, _sum: { totalAmount: true } }),
    ]);
    const summary = await generateSalesSummary({
      totalSales: salesCount,
      totalRevenue: Number(revenueAgg._sum.totalAmount || 0),
      period: today.toLocaleString('default', { month: 'long', year: 'numeric' }),
    });
    res.json({ success: true, data: { summary } });
  } catch (error: any) {
    logger.error('AI summary failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
