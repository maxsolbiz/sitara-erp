import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';

export class DashboardService {
  async getStats() {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant context');

    const tenantId = ctx.tenantId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      todaySales,
      todayRevenue,
      totalProducts,
      totalCustomers,
      lowStockCount,
      monthlyRevenue,
      pendingReturns,
    ] = await Promise.all([
      prisma.sale.count({
        where: { tenantId, saleDate: { gte: today }, status: 'COMPLETED' },
      }),
      prisma.sale.aggregate({
        where: { tenantId, saleDate: { gte: today }, status: 'COMPLETED' },
        _sum: { totalAmount: true },
      }),
      prisma.product.count({ where: { tenantId, isActive: true } }),
      prisma.customer.count({ where: { tenantId, isActive: true } }),
      prisma.warehouseStock.count({
        where: { tenantId, quantity: { lte: 10 } },
      }),
      prisma.sale.aggregate({
        where: { tenantId, saleDate: { gte: firstOfMonth }, status: 'COMPLETED' },
        _sum: { totalAmount: true },
      }),
      prisma.salesReturn.count({
        where: { tenantId, status: 'PENDING' },
      }),
    ]);

    // Previous month revenue for comparison
    const firstOfLastMonth = new Date(firstOfMonth);
    firstOfLastMonth.setMonth(firstOfLastMonth.getMonth() - 1);
    const lastMonthRevenue = await prisma.sale.aggregate({
      where: { tenantId, saleDate: { gte: firstOfLastMonth, lt: firstOfMonth }, status: 'COMPLETED' },
      _sum: { totalAmount: true },
    });

    const currentRev = Number(monthlyRevenue._sum.totalAmount || 0);
    const lastRev = Number(lastMonthRevenue._sum.totalAmount || 0);
    const change = lastRev > 0 ? ((currentRev - lastRev) / lastRev) * 100 : 0;

    return {
      todaySales,
      todayRevenue: Number(todayRevenue._sum.totalAmount || 0),
      totalProducts,
      totalCustomers,
      lowStockCount,
      monthlyRevenue: currentRev,
      monthlyRevenueChange: Math.round(change * 100) / 100,
      pendingReturns,
    };
  }

  async getRecentSales(limit = 10) {
    const ctx = getTenantContext();
    if (!ctx) return [];

    const sales = await prisma.sale.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        saleNumber: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        customer: { select: { fullName: true } },
      },
    });

    return sales.map((s) => ({
      id: s.id.toString(),
      saleNumber: s.saleNumber,
      customerName: s.customer?.fullName || 'Walk-in',
      total: Number(s.totalAmount),
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async getLowStockItems(limit = 10) {
    const ctx = getTenantContext();
    if (!ctx) return [];

    const items = await prisma.warehouseStock.findMany({
      where: { tenantId: ctx.tenantId, quantity: { lte: 10 } },
      orderBy: { quantity: 'asc' },
      take: limit,
      select: {
        quantity: true,
        product: { select: { id: true, name: true, sku: true, reorderLevel: true } },
      },
    });

    return items.map((i) => ({
      id: i.product.id.toString(),
      name: i.product.name,
      sku: i.product.sku,
      stock: i.quantity,
      reorderLevel: i.product.reorderLevel,
    }));
  }

  async getSalesChart() {
    const ctx = getTenantContext(); if (!ctx) return [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const sales = await prisma.sale.findMany({
      where: { tenantId: ctx.tenantId, status: 'COMPLETED', saleDate: { gte: thirtyDaysAgo } },
      select: { saleDate: true, totalAmount: true },
    });
    const byDate: Record<string, { revenue: number; sales: number }> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() - i * 86400000);
      byDate[d.toISOString().slice(0, 10)] = { revenue: 0, sales: 0 };
    }
    for (const s of sales) {
      const key = s.saleDate.toISOString().slice(0, 10);
      if (byDate[key]) { byDate[key].revenue += Number(s.totalAmount); byDate[key].sales++; }
    }
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({ date, ...data }));
  }

  async getTopProducts() {
    const ctx = getTenantContext(); if (!ctx) return [];
    const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const items = await prisma.saleItem.findMany({
      where: { tenantId: ctx.tenantId, quantity: { gt: 0 }, sale: { status: 'COMPLETED', saleDate: { gte: startOfMonth } } },
      include: { product: { select: { name: true } } },
    });
    const grouped: Record<string, { unitsSold: number; revenue: number; profit: number }> = {};
    for (const i of items) {
      const name = i.product?.name || 'Unknown';
      if (!grouped[name]) grouped[name] = { unitsSold: 0, revenue: 0, profit: 0 };
      grouped[name].unitsSold += i.quantity;
      grouped[name].revenue += Number(i.lineTotal);
      grouped[name].profit += Number(i.profitAmount);
    }
    return Object.entries(grouped).sort(([, a], [, b]) => b.revenue - a.revenue).slice(0, 10).map(([name, data]) => ({ productName: name, ...data }));
  }

  async getPaymentBreakdown() {
    const ctx = getTenantContext(); if (!ctx) return [];
    const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const payments = await prisma.salePayment.findMany({
      where: { tenantId: ctx.tenantId, sale: { status: 'COMPLETED', saleDate: { gte: startOfMonth } } },
      select: { paymentMethod: true, amount: true },
    });
    const grouped: Record<string, { amount: number; count: number }> = {};
    for (const p of payments) {
      if (!grouped[p.paymentMethod]) grouped[p.paymentMethod] = { amount: 0, count: 0 };
      grouped[p.paymentMethod].amount += Number(p.amount);
      grouped[p.paymentMethod].count++;
    }
    return Object.entries(grouped).map(([method, data]) => ({ method, ...data }));
  }

  async getPendingActions() {
    const ctx = getTenantContext(); if (!ctx) return {};
    const tenantId = ctx.tenantId;
    const [pendingReturns, pendingExpenses, lowStockCount] = await Promise.all([
      prisma.salesReturn.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.expense.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.warehouseStock.count({ where: { tenantId, quantity: { lte: 10 } } }),
    ]);
    return { pendingReturns, pendingExpenses, lowStockCount };
  }
}

export const dashboardService = new DashboardService();
