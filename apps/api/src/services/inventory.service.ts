import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';

export class InventoryService {
  async getWarehouses() {
    const ctx = getTenantContext(); if (!ctx) return [];
    const w = await prisma.warehouse.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { code: 'asc' } });
    return w.map((wh) => ({ id: wh.id.toString(), code: wh.code, name: wh.name, address: wh.address, phone: wh.phone, email: wh.email, managerName: wh.managerName, isActive: wh.isActive, isDefault: wh.isDefault, createdAt: wh.createdAt }));
  }

  async createWarehouse(data: any) {
    const ctx = getTenantContext(); if (!ctx) throw new Error('No tenant');
    const w = await prisma.warehouse.create({ data: { tenantId: ctx.tenantId, code: data.code, name: data.name, address: data.address || null, phone: data.phone || null, email: data.email || null, managerName: data.managerName || null, isActive: true } });
    return { id: w.id.toString() };
  }

  async getStock(params: { warehouseId?: number; lowStock?: boolean }) {
    const ctx = getTenantContext(); if (!ctx) return [];
    const where: any = { tenantId: ctx.tenantId };
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.lowStock) where.quantity = { lte: 10 };
    const stock = await prisma.warehouseStock.findMany({
      where, include: { product: { select: { name: true, sku: true, sellingPrice: true, reorderLevel: true } }, warehouse: { select: { name: true } } },
      orderBy: { quantity: 'asc' },
    });
    return stock.map((s) => ({ id: s.id.toString(), productId: s.productId.toString(), productName: s.product.name, sku: s.product.sku, price: Number(s.product.sellingPrice), quantity: s.quantity, warehouse: s.warehouse.name, reorderLevel: s.product.reorderLevel }));
  }

  async getMovements(params: { productId?: number; warehouseId?: number; page?: number }) {
    const ctx = getTenantContext(); if (!ctx) throw new Error('No tenant');
    const where: any = { tenantId: ctx.tenantId };
    if (params.productId) where.productId = params.productId;
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    const page = params.page || 1;
    const [items, total] = await Promise.all([
      prisma.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 20, take: 20, include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true } } } }),
      prisma.stockMovement.count({ where }),
    ]);
    return { items: items.map((m) => ({ id: m.id.toString(), tenantId: m.tenantId.toString(), movementType: m.movementType, quantity: m.quantity, unitCost: Number(m.unitCost), referenceType: m.referenceType, referenceId: m.referenceId?.toString() || null, productId: m.productId.toString(), productName: m.product.name, warehouseId: m.warehouseId.toString(), warehouseName: m.warehouse.name, createdAt: m.createdAt })), total, page };
  }

  async getStats() {
    const ctx = getTenantContext(); if (!ctx) throw new Error('No tenant');
    const [products, stockSum, movements, lowStock] = await Promise.all([
      prisma.warehouseStock.count({ where: { tenantId: ctx.tenantId } }),
      prisma.warehouseStock.aggregate({ where: { tenantId: ctx.tenantId }, _sum: { quantity: true } }),
      prisma.stockMovement.count({ where: { tenantId: ctx.tenantId } }),
      prisma.warehouseStock.count({ where: { tenantId: ctx.tenantId, quantity: { lte: 10 } } }),
    ]);
    return { products, totalStock: stockSum._sum.quantity || 0, movements, lowStock };
  }
}

export const inventoryService = new InventoryService();
