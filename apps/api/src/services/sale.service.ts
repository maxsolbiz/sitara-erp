import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';

export class SaleService {
  async list(params: { search?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number; perPage?: number; userId?: string }) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');

    const where: any = { tenantId: ctx.tenantId };
    if (params.userId) where.createdBy = BigInt(params.userId);
    if (params.status && params.status !== 'ALL') where.status = params.status;
    if (params.dateFrom) where.saleDate = { ...where.saleDate, gte: new Date(params.dateFrom) };
    if (params.dateTo) where.saleDate = { ...where.saleDate, lte: new Date(params.dateTo + 'T23:59:59') };
    if (params.search) {
      where.OR = [
        { saleNumber: { contains: params.search, mode: 'insensitive' } },
        { customer: { fullName: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const page = params.page || 1;
    const perPage = params.perPage || 20;
    const skip = (page - 1) * perPage;

    const [items, total] = await Promise.all([
      prisma.sale.findMany({
        where, skip, take: perPage, orderBy: { createdAt: 'desc' },
        select: {
          id: true, saleNumber: true, totalAmount: true, paidAmount: true,
          status: true, paymentStatus: true, saleDate: true, createdAt: true,
          customer: { select: { id: true, fullName: true } },
          items: { select: { quantity: true } },
        },
      }),
      prisma.sale.count({ where }),
    ]);

    return {
      items: items.map((s) => ({
        id: s.id.toString(), saleNumber: s.saleNumber,
        customerName: s.customer?.fullName || 'Walk-in',
        total: Number(s.totalAmount), paid: Number(s.paidAmount),
        status: s.status, paymentStatus: s.paymentStatus,
        saleDate: s.saleDate.toISOString(), createdAt: s.createdAt.toISOString(),
        itemsCount: s.items.filter((i: any) => i.quantity > 0).length,
      })),
      total, page, perPage, totalPages: Math.ceil(total / perPage),
    };
  }

  async getById(id: bigint) {
    const ctx = getTenantContext();
    if (!ctx) return null;
    const s = await prisma.sale.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        createdByUser: { select: { fullName: true } },
        tenant: { select: { name: true, settings: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
        payments: true,
      },
    });
    if (!s) return null;
    const toNum = (v: any) => Number(v) || 0;
    return {
      id: s.id.toString(), saleNumber: s.saleNumber, saleDate: s.saleDate, status: s.status, paymentStatus: s.paymentStatus,
      subtotal: toNum(s.subtotal), discountAmount: toNum(s.discountAmount), totalAmount: toNum(s.totalAmount),
      paidAmount: toNum(s.paidAmount), changeAmount: toNum(s.changeAmount),
      notes: s.notes, tierId: s.tierId?.toString() || null, tierName: s.tierName, tierDiscount: s.tierDiscount ? toNum(s.tierDiscount) : null,
      customer: s.customer ? { id: s.customer.id.toString(), fullName: s.customer.fullName, phone: s.customer.phone } : null,
      createdByUser: s.createdByUser ? { fullName: s.createdByUser.fullName } : null,
      tenant: s.tenant ? { name: s.tenant.name, settings: s.tenant.settings } : null,
      items: s.items.map((i: any) => ({ id: i.id.toString(), productId: i.productId.toString(), product: i.product, quantity: i.quantity, unitPrice: toNum(i.unitPrice), unitCost: toNum(i.unitCost), lineTotal: toNum(i.lineTotal), cogsAmount: toNum(i.cogsAmount), profitAmount: toNum(i.profitAmount) })),
      payments: s.payments.map((p: any) => ({ id: p.id.toString(), paymentMethod: p.paymentMethod, amount: toNum(p.amount), referenceNumber: p.referenceNumber })),
    };
  }

  async getStats(userId?: string) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const baseWhere: any = { tenantId: ctx.tenantId };
    const todayWhere: any = { tenantId: ctx.tenantId, saleDate: { gte: today } };
    if (userId) {
      baseWhere.createdBy = BigInt(userId);
      todayWhere.createdBy = BigInt(userId);
    }
    const [todayCount, todayRevenue, total, totalRevenue, cancelled] = await Promise.all([
      prisma.sale.count({ where: { ...todayWhere, status: 'COMPLETED' } }),
      prisma.sale.aggregate({ where: { ...todayWhere, status: 'COMPLETED' }, _sum: { totalAmount: true } }),
      prisma.sale.count({ where: baseWhere }),
      prisma.sale.aggregate({ where: { ...baseWhere, status: 'COMPLETED' }, _sum: { totalAmount: true } }),
      prisma.sale.count({ where: { ...baseWhere, status: 'CANCELLED' } }),
    ]);
    return {
      todaySales: todayCount, todayRevenue: Number(todayRevenue._sum.totalAmount || 0),
      totalSales: total, totalRevenue: Number(totalRevenue._sum.totalAmount || 0),
      cancelledSales: cancelled,
      avgOrderValue: total > 0 ? Number(totalRevenue._sum.totalAmount || 0) / total : 0,
    };
  }
}

export const saleService = new SaleService();
