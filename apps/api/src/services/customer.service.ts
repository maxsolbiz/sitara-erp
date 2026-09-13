import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';

export class CustomerService {
  async list(params: { search?: string; page?: number; perPage?: number; isActive?: string; customerGroup?: string; overLimitOnly?: string }) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');

    const where: any = { tenantId: ctx.tenantId };
    if (params.search) {
      where.OR = [
        { fullName: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { customerCode: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.isActive !== undefined && params.isActive !== '') {
      where.isActive = params.isActive === 'true';
    }
    if (params.customerGroup && params.customerGroup !== '') {
      where.customerGroup = params.customerGroup;
    }
    let overLimitOnly = params.overLimitOnly === 'true';
    if (overLimitOnly) {
      where.creditLimit = { gt: 0 };
    }

    const page = params.page || 1;
    const perPage = params.perPage || 20;
    const skip = (page - 1) * perPage;

    let [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: overLimitOnly ? 0 : skip,
        take: overLimitOnly ? 10000 : perPage,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, customerCode: true, fullName: true, email: true, phone: true,
          creditLimit: true, currentBalance: true, isActive: true, createdAt: true,
          customerGroup: true,
          pricingTier: { select: { id: true, name: true, discountPercent: true } },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    if (overLimitOnly) {
      items = items.filter((c) => Number(c.currentBalance) > Number(c.creditLimit));
      total = items.length;
      items = items.slice(skip, skip + perPage);
    }

    return {
      items: items.map((c) => ({ id: c.id.toString(), customerCode: c.customerCode, fullName: c.fullName, email: c.email, phone: c.phone, creditLimit: Number(c.creditLimit), currentBalance: Number(c.currentBalance), isActive: c.isActive, customerGroup: c.customerGroup, createdAt: c.createdAt, pricingTier: c.pricingTier ? { id: c.pricingTier.id.toString(), name: c.pricingTier.name, discountPercent: Number(c.pricingTier.discountPercent) } : null })),
      total, page, perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async getById(id: bigint) {
    const ctx = getTenantContext();
    if (!ctx) return null;
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { pricingTier: { select: { id: true, name: true, discountPercent: true } } },
    });
    if (!customer) return null;
    return { id: customer.id.toString(), customerCode: customer.customerCode, fullName: customer.fullName, email: customer.email, phone: customer.phone, address: customer.address, city: customer.city, taxNumber: customer.taxNumber, creditLimit: Number(customer.creditLimit), currentBalance: Number(customer.currentBalance), creditDays: customer.creditDays, customerGroup: customer.customerGroup, notes: customer.notes, isActive: customer.isActive, barcode: customer.barcode, createdAt: customer.createdAt, updatedAt: customer.updatedAt, deletedAt: customer.deletedAt, pricingTier: customer.pricingTier ? { id: customer.pricingTier.id.toString(), name: customer.pricingTier.name, discountPercent: Number(customer.pricingTier.discountPercent) } : null };
  }

  async create(data: any) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    const code = `CUS-${Date.now().toString(36).toUpperCase()}`;
    const customer = await prisma.customer.create({
      data: {
        tenantId: ctx.tenantId, customerCode: code,
        fullName: data.fullName, email: data.email || null, phone: data.phone || null,
        address: data.address || null, city: data.city || null, taxNumber: data.taxNumber || null,
        creditLimit: data.creditLimit || 0, creditDays: data.creditDays ?? 0,
        customerGroup: data.customerGroup || null, notes: data.notes || null,
        isActive: true,
      },
    });
    return { id: customer.id.toString(), customerCode: customer.customerCode };
  }

  async update(id: bigint, data: any) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    await prisma.customer.updateMany({ where: { id, tenantId: ctx.tenantId }, data });
    return { id: id.toString() };
  }

  async delete(id: bigint) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    await prisma.customer.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { isActive: false } });
  }

  async getStats() {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    const [total, active, balanceSum, withBalance] = await Promise.all([
      prisma.customer.count({ where: { tenantId: ctx.tenantId } }),
      prisma.customer.count({ where: { tenantId: ctx.tenantId, isActive: true } }),
      prisma.customer.aggregate({ where: { tenantId: ctx.tenantId }, _sum: { currentBalance: true } }),
      prisma.customer.count({ where: { tenantId: ctx.tenantId, currentBalance: { gt: 0 } } }),
    ]);
    return { total, active, totalReceivable: Number(balanceSum._sum.currentBalance || 0), withBalance };
  }

  async getDashboardStats(customerId: bigint) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId } });
    if (!customer) return null;

    const [salesAgg, paymentsAgg, returnsAgg] = await Promise.all([
      prisma.sale.aggregate({
        where: { tenantId: ctx.tenantId, customerId, status: 'COMPLETED' },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.customerPayment.aggregate({
        where: { tenantId: ctx.tenantId, customerId },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.salesReturn.aggregate({
        where: { tenantId: ctx.tenantId, customerId, status: { in: ['APPROVED', 'COMPLETED'] } },
        _sum: { totalAmount: true },
      }),
    ]);

    const creditLimit = Number(customer.creditLimit);
    const currentBalance = Number(customer.currentBalance);
    const availableCredit = Math.max(0, creditLimit - currentBalance);
    const creditUtilization = creditLimit > 0 ? Math.round((currentBalance / creditLimit) * 100) : 0;

    return {
      totalPurchases: Number(salesAgg._sum.totalAmount || 0),
      saleCount: salesAgg._count,
      totalPayments: Number(paymentsAgg._sum.amount || 0),
      paymentCount: paymentsAgg._count,
      totalReturns: Number(returnsAgg._sum.totalAmount || 0),
      creditLimit,
      currentBalance,
      availableCredit,
      creditUtilization,
      isOverCreditLimit: currentBalance > creditLimit && creditLimit > 0,
    };
  }
}

export const customerService = new CustomerService();
