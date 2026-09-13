import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { generateSku } from '../utils/helpers';

export class ProductService {
  async list(params: { search?: string; categoryId?: number; status?: string; page?: number; perPage?: number }) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');

    const where: any = { tenantId: ctx.tenantId, deletedAt: null };
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { sku: { contains: params.search, mode: 'insensitive' } },
        { barcode: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.status === 'active') where.isActive = true;
    else if (params.status === 'inactive') where.isActive = false;

    const page = params.page || 1;
    const perPage = params.perPage || 20;
    const skip = (page - 1) * perPage;

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, sku: true, barcode: true, name: true,
          costPrice: true, sellingPrice: true, taxRate: true,
          isActive: true, isTrackInventory: true, unitOfMeasure: true,
          reorderLevel: true, createdAt: true,
          category: { select: { id: true, name: true } },
          warehouseStock: { select: { quantity: true }, take: 1 },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      items: items.map((p) => ({
        id: p.id.toString(),
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        costPrice: Number(p.costPrice),
        sellingPrice: Number(p.sellingPrice),
        taxRate: Number(p.taxRate),
        isActive: p.isActive,
        unitOfMeasure: p.unitOfMeasure,
        reorderLevel: p.reorderLevel,
        createdAt: p.createdAt.toISOString(),
        category: p.category?.name || 'Uncategorized',
        stock: p.warehouseStock.reduce((s, ws) => s + ws.quantity, 0),
      })),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async getById(id: bigint) {
    const ctx = getTenantContext();
    if (!ctx) return null;

    const product = await prisma.product.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        category: true,
        variants: true,
        images: { orderBy: { sortOrder: 'asc' } },
        warehouseStock: { include: { warehouse: { select: { name: true } } } },
      },
    });
    if (!product) return null;

    return {
      id: product.id.toString(), sku: product.sku, barcode: product.barcode, name: product.name, description: product.description,
      categoryId: product.categoryId?.toString() || null, category: product.category,
      unitOfMeasure: product.unitOfMeasure, costPrice: Number(product.costPrice), sellingPrice: Number(product.sellingPrice),
      taxRate: Number(product.taxRate), reorderLevel: product.reorderLevel, reorderQuantity: product.reorderQuantity,
      imagePath: product.imagePath, isActive: product.isActive, isTrackInventory: product.isTrackInventory,
      createdAt: product.createdAt, updatedAt: product.updatedAt,
      variants: product.variants?.map((v: any) => ({ id: v.id.toString(), sku: v.sku, name: v.name, costPrice: Number(v.costPrice), sellingPrice: Number(v.sellingPrice) })),
      images: product.images?.map((img: any) => ({ id: img.id.toString(), imagePath: img.imagePath, isPrimary: img.isPrimary, sortOrder: img.sortOrder })),
      warehouseStock: product.warehouseStock?.map((ws: any) => ({ id: ws.id.toString(), warehouseId: ws.warehouseId.toString(), warehouseName: ws.warehouse?.name, quantity: ws.quantity, averageCost: Number(ws.averageCost) })),
    };
  }

  async create(data: any) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');

    const sku = data.sku || generateSku(data.name, data.categoryId?.toString() || 'GEN');
    const product = await prisma.product.create({
      data: {
        tenantId: ctx.tenantId,
        sku,
        barcode: data.barcode || null,
        name: data.name,
        description: data.description || null,
        categoryId: data.categoryId ? BigInt(data.categoryId) : null,
        unitOfMeasure: data.unitOfMeasure || 'pieces',
        costPrice: data.costPrice || 0,
        sellingPrice: data.sellingPrice || 0,
        taxRate: data.taxRate || 0,
        reorderLevel: data.reorderLevel || 10,
        reorderQuantity: data.reorderQuantity || 50,
        isActive: data.isActive !== false,
        isTrackInventory: data.isTrackInventory !== false,
      },
    });

    return { id: product.id.toString(), sku: product.sku };
  }

  async update(id: bigint, data: any) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId ? BigInt(data.categoryId) : null;
    if (data.unitOfMeasure !== undefined) updateData.unitOfMeasure = data.unitOfMeasure;
    if (data.costPrice !== undefined) updateData.costPrice = data.costPrice;
    if (data.sellingPrice !== undefined) updateData.sellingPrice = data.sellingPrice;
    if (data.taxRate !== undefined) updateData.taxRate = data.taxRate;
    if (data.barcode !== undefined) updateData.barcode = data.barcode;
    if (data.reorderLevel !== undefined) updateData.reorderLevel = data.reorderLevel;
    if (data.reorderQuantity !== undefined) updateData.reorderQuantity = data.reorderQuantity;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    await prisma.product.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: updateData,
    });

    return { id: id.toString() };
  }

  async delete(id: bigint) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    await prisma.product.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async getStats() {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');

    const [totalProducts, activeProducts, totalStock, lowStock, outOfStock, stockValue] = await Promise.all([
      prisma.product.count({ where: { tenantId: ctx.tenantId } }),
      prisma.product.count({ where: { tenantId: ctx.tenantId, isActive: true } }),
      prisma.warehouseStock.aggregate({ where: { tenantId: ctx.tenantId }, _sum: { quantity: true } }),
      prisma.warehouseStock.count({ where: { tenantId: ctx.tenantId, quantity: { lte: 10, gt: 0 } } }),
      prisma.warehouseStock.count({ where: { tenantId: ctx.tenantId, quantity: 0 } }),
      prisma.warehouseStock.aggregate({
        where: { tenantId: ctx.tenantId },
        _sum: { averageCost: true },
      }),
    ]);

    return {
      totalProducts,
      activeProducts,
      totalStock: totalStock._sum.quantity || 0,
      lowStock,
      outOfStock,
      stockValue: Number(stockValue._sum.averageCost || 0),
    };
  }
}

export const productService = new ProductService();
