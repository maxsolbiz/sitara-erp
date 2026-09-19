import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import logger from '../utils/logger';

const router = Router();

router.get('/', rbacMiddleware('reports.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.json({ data: [], query: '', total: 0 }); return; }
    const q = (req.query.q as string || '').trim();
    const limit = Math.min(Number(req.query.limit) || 5, 10);
    if (q.length < 2) { res.json({ data: [], query: q, total: 0 }); return; }
    const tenantId = ctx.tenantId;

    const [products, customers, vendors, sales, purchases, expenses] = await Promise.all([
      prisma.product.findMany({
        where: { tenantId, deletedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { barcode: { contains: q } }] },
        select: { id: true, name: true, sku: true, sellingPrice: true },
        take: limit,
      }),
      prisma.customer.findMany({
        where: { tenantId, deletedAt: null, OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { customerCode: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, fullName: true, phone: true, currentBalance: true },
        take: limit,
      }),
      prisma.vendor.findMany({
        where: { tenantId, deletedAt: null, OR: [{ companyName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { code: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, companyName: true, phone: true },
        take: limit,
      }),
      prisma.sale.findMany({
        where: { tenantId, saleNumber: { contains: q, mode: 'insensitive' } },
        select: { id: true, saleNumber: true, totalAmount: true, saleDate: true },
        take: limit,
      }),
      prisma.purchaseOrder.findMany({
        where: { tenantId, orderNumber: { contains: q, mode: 'insensitive' } },
        select: { id: true, orderNumber: true, totalAmount: true, status: true },
        take: limit,
      }),
      prisma.expense.findMany({
        where: { tenantId, OR: [{ description: { contains: q, mode: 'insensitive' } }, { expenseNumber: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, description: true, expenseNumber: true, amount: true },
        take: limit,
      }),
    ]);

    const data: any[] = [];
    for (const p of products) data.push({ type: 'product', id: p.id.toString(), title: p.name, subtitle: `SKU: ${p.sku}`, link: `/products/${p.id}`, meta: `PKR ${Number(p.sellingPrice).toLocaleString()}` });
    for (const c of customers) data.push({ type: 'customer', id: c.id.toString(), title: c.fullName, subtitle: c.phone || '', link: `/customers/${c.id}`, meta: `Balance: PKR ${Number(c.currentBalance).toLocaleString()}` });
    for (const v of vendors) data.push({ type: 'vendor', id: v.id.toString(), title: v.companyName, subtitle: v.phone || '', link: `/vendors/${v.id}`, meta: '' });
    for (const s of sales) data.push({ type: 'sale', id: s.id.toString(), title: s.saleNumber, subtitle: new Date(s.saleDate).toLocaleDateString(), link: `/sales/${s.id}`, meta: `PKR ${Number(s.totalAmount).toLocaleString()}` });
    for (const po of purchases) data.push({ type: 'purchase', id: po.id.toString(), title: po.orderNumber, subtitle: po.status, link: `/purchases/orders/${po.id}`, meta: `PKR ${Number(po.totalAmount).toLocaleString()}` });
    for (const e of expenses) data.push({ type: 'expense', id: e.id.toString(), title: e.description, subtitle: e.expenseNumber || '', link: `/expenses`, meta: `PKR ${Number(e.amount).toLocaleString()}` });

    res.json({ data: data.slice(0, limit * 3), query: q, total: data.length });
  } catch (error: any) {
    logger.warn('Global search failed', { error: error.message });
    res.json({ data: [], query: '', total: 0 });
  }
});

export default router;
