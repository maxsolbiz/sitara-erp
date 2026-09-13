import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';

export class PurchaseService {
  async listOrders(params: { search?: string; status?: string; vendorId?: number; page?: number; perPage?: number }) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    const where: any = { tenantId: ctx.tenantId };
    if (params.search) where.OR = [{ orderNumber: { contains: params.search } }, { vendor: { companyName: { contains: params.search, mode: 'insensitive' } } }];
    if (params.status) where.status = params.status;
    if (params.vendorId) where.vendorId = params.vendorId;
    const page = params.page || 1, perPage = params.perPage || 20;
    const [items, total] = await Promise.all([
      prisma.purchaseOrder.findMany({ where, skip: (page - 1) * perPage, take: perPage, orderBy: { createdAt: 'desc' }, include: { vendor: { select: { companyName: true } }, items: { select: { quantityOrdered: true } } } }),
      prisma.purchaseOrder.count({ where }),
    ]);
    return { items: items.map((o) => ({ id: o.id.toString(), orderNumber: o.orderNumber, vendorId: o.vendorId.toString(), vendorName: o.vendor.companyName, orderDate: o.orderDate, status: o.status, totalAmount: Number(o.totalAmount), itemCount: o.items.length })), total, page, perPage };
  }

  async getOrder(id: bigint) {
    const ctx = getTenantContext();
    if (!ctx) return null;
    const o = await prisma.purchaseOrder.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { vendor: true, items: { include: { product: { select: { name: true, sku: true } } } }, receipts: { include: { items: true } } } });
    if (!o) return null;
    const toStr = (v: any) => v?.toString ? v.toString() : v;
    const toNum = (v: any) => Number(v) || 0;
    return {
      id: toStr(o.id), tenantId: toStr(o.tenantId), orderNumber: o.orderNumber, vendorId: toStr(o.vendorId),
      orderDate: o.orderDate, expectedDate: o.expectedDate,
      subtotal: toNum(o.subtotal), taxAmount: toNum(o.taxAmount), discountAmount: toNum(o.discountAmount),
      shippingCost: toNum(o.shippingCost), totalAmount: toNum(o.totalAmount),
      status: o.status, notes: o.notes, createdBy: toStr(o.createdBy),
      createdAt: o.createdAt, updatedAt: o.updatedAt,
      vendor: o.vendor ? { id: toStr(o.vendor.id), companyName: o.vendor.companyName, contactPerson: o.vendor.contactPerson, email: o.vendor.email, phone: o.vendor.phone, address: o.vendor.address, currentBalance: toNum(o.vendor.currentBalance) } : null,
      items: o.items.map((i: any) => ({ id: toStr(i.id), purchaseOrderId: toStr(i.purchaseOrderId), productId: toStr(i.productId), product: i.product, quantityOrdered: i.quantityOrdered, quantityReceived: i.quantityReceived, unitCost: toNum(i.unitCost), lineTotal: toNum(i.lineTotal) })),
      receipts: o.receipts.map((r: any) => ({ id: toStr(r.id), receiptNumber: r.receiptNumber, receiptDate: r.receiptDate, totalItems: r.totalItems, items: r.items.map((ri: any) => ({ id: toStr(ri.id), quantityReceived: ri.quantityReceived, unitCost: toNum(ri.unitCost) })) })),
    };
  }

  async createOrder(data: any) {
    const ctx = getTenantContext(); if (!ctx) throw new Error('No tenant');
    const orderNumber = `PO-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
    return prisma.$transaction(async (tx) => {
      const subtotal = data.items.reduce((s: number, i: any) => s + (i.unitCost * i.quantityOrdered), 0);
      const order = await tx.purchaseOrder.create({
        data: { tenantId: ctx.tenantId, orderNumber, vendorId: BigInt(data.vendorId), orderDate: new Date(data.orderDate || new Date()), expectedDate: data.expectedDate ? new Date(data.expectedDate) : null, subtotal, totalAmount: subtotal + (data.taxAmount || 0) - (data.discountAmount || 0) + (data.shippingCost || 0), status: 'DRAFT', notes: data.notes || null, createdBy: BigInt(data.createdBy || ctx.tenantId), financialYearId: null, items: { create: data.items.map((i: any) => ({ tenantId: ctx.tenantId, productId: BigInt(i.productId), quantityOrdered: i.quantityOrdered, unitCost: i.unitCost, lineTotal: i.unitCost * i.quantityOrdered })) } },
      });
      return { id: order.id.toString(), orderNumber: order.orderNumber };
    });
  }

  async getStats() {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    const [total, pending, partial, received, cancelled] = await Promise.all([
      prisma.purchaseOrder.count({ where: { tenantId: ctx.tenantId } }),
      prisma.purchaseOrder.count({ where: { tenantId: ctx.tenantId, status: 'DRAFT' } }),
      prisma.purchaseOrder.count({ where: { tenantId: ctx.tenantId, status: 'PARTIAL' } }),
      prisma.purchaseOrder.count({ where: { tenantId: ctx.tenantId, status: 'RECEIVED' } }),
      prisma.purchaseOrder.count({ where: { tenantId: ctx.tenantId, status: 'CANCELLED' } }),
    ]);
    return { total, pending, partial, received, cancelled };
  }
}

export const purchaseService = new PurchaseService();
