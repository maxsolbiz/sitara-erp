import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { inventoryService } from '../services/inventory.service';
import { rbacMiddleware } from '../middleware/rbac';
import { ACCOUNT_CODES } from '../constants/accounts';
import { parseIdParam } from '../utils/helpers';
import { logActivity } from '../utils/activity';
import logger from '../utils/logger';

const router = Router();

// Reject malformed numeric IDs with 400 instead of 500/P2025 downstream
// (BigInt('') silently coerces to 0n; BigInt('abc') throws).
router.param('id', (req, res, next, val) => {
  if (parseIdParam(val) === null) {
    res.status(400).json({ status: 400, title: 'Bad Request', detail: 'Invalid id parameter' });
    return;
  }
  next();
});

router.get('/stats', rbacMiddleware('inventory.view'), async (_req: Request, res: Response) => {
  try { const s = await inventoryService.getStats(); res.json({ data: s }); }
  catch { res.json({ data: { products: 0, totalStock: 0, movements: 0, lowStock: 0 } }); }
});

router.get('/warehouses', rbacMiddleware('inventory.view'), async (_req: Request, res: Response) => {
  try { const w = await inventoryService.getWarehouses(); res.json({ data: w }); }
  catch { res.json({ data: [] }); }
});

router.post('/warehouses', rbacMiddleware('inventory.adjust'), async (req: Request, res: Response) => {
    try { const r = await inventoryService.createWarehouse(req.body); res.status(201).json({ data: r }); }
    catch (e: any) { logger.error('Warehouse create failed', { error: e.message }); res.status(500).json({ status: 500, detail: e.message }); }
});

router.get('/stock', rbacMiddleware('inventory.view'), async (req: Request, res: Response) => {
  try { const s = await inventoryService.getStock({ warehouseId: req.query.warehouseId ? Number(req.query.warehouseId) : undefined, lowStock: req.query.lowStock === 'true' }); res.json({ data: s }); }
  catch { res.json({ data: [] }); }
});

router.get('/movements', rbacMiddleware('inventory.view'), async (req: Request, res: Response) => {
  try { const r = await inventoryService.getMovements({ productId: req.query.productId ? Number(req.query.productId) : undefined, warehouseId: req.query.warehouseId ? Number(req.query.warehouseId) : undefined, page: req.query.page ? Number(req.query.page) : 1 }); res.json({ data: r.items, meta: { total: r.total } }); }
  catch { res.json({ data: [] }); }
});

router.get('/alerts', rbacMiddleware('inventory.view'), async (_req: Request, res: Response) => {
  try { const s = await inventoryService.getStock({ lowStock: true }); res.json({ data: s }); }
  catch { res.json({ data: [] }); }
});

// ---- Adjustments ----
router.get('/adjustments', rbacMiddleware('inventory.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const page = Number(req.query.page) || 1;
    const [items, total] = await Promise.all([
      prisma.stockAdjustment.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * 20, take: 20,
        include: { product: { select: { name: true } }, warehouse: { select: { name: true } } },
      }),
      prisma.stockAdjustment.count({ where: { tenantId: ctx.tenantId } }),
    ]);
    res.json({ data: items.map((a) => ({ id: a.id.toString(), productId: a.productId.toString(), productName: a.product?.name, warehouseId: a.warehouseId.toString(), warehouseName: a.warehouse?.name, adjustmentType: a.adjustmentType, quantityBefore: a.quantityBefore, quantityAdjusted: a.quantityAdjusted, quantityAfter: a.quantityAfter, reason: a.reason, status: a.approvedAt ? 'APPROVED' : a.createdAt ? 'PENDING' : 'PENDING', createdAt: a.createdAt })), meta: { total, page } });
  } catch { res.json({ data: [] }); }
});

router.post('/adjustments', rbacMiddleware('inventory.adjustments'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { warehouseId, reason, notes, items } = req.body;
    if (!items || items.length === 0) { res.status(400).json({ status: 400, detail: 'Items required' }); return; }
    const tenantId = ctx.tenantId;
    // FK ownership: warehouse and every product must belong to this tenant.
    const warehouse = await prisma.warehouse.findFirst({ where: { id: BigInt(warehouseId), tenantId }, select: { id: true } });
    if (!warehouse) { res.status(403).json({ status: 403, detail: 'Warehouse not found or not accessible' }); return; }
    for (const item of items) {
      const product = await prisma.product.findFirst({ where: { id: BigInt(item.productId), tenantId }, select: { id: true } });
      if (!product) { res.status(403).json({ status: 403, detail: `Product ${item.productId} not found or not accessible` }); return; }
    }
    const result = await prisma.$transaction(async (tx: any) => {
      const created: any[] = [];
      for (const item of items) {
        const adj = await tx.stockAdjustment.create({
          data: {
            tenantId, warehouseId: BigInt(warehouseId), productId: BigInt(item.productId),
            adjustmentType: item.quantityAfter > item.quantityBefore ? 'INCREASE' : 'DECREASE',
            quantityBefore: item.quantityBefore, quantityAfter: item.quantityAfter,
            quantityAdjusted: Math.abs(item.quantityAfter - item.quantityBefore),
            reason: item.reason || reason || 'Manual adjustment', createdBy: req.user ? BigInt(req.user.userId) : 1,
          },
        });
        created.push(adj);
      }
      return created;
    });
    logger.info('Stock adjustment created', { count: result.length, tenantId: tenantId.toString() });
    res.status(201).json({ data: { message: `${result.length} adjustment(s) created`, ids: result.map((a: any) => a.id.toString()) } });
  } catch (error: any) { logger.error('Adjustment create failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.patch('/adjustments/:id/approve', rbacMiddleware('inventory.adjustments'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const tenantId = ctx.tenantId;
    const adjustment = await prisma.stockAdjustment.findFirst({ where: { id: BigInt(req.params.id), tenantId } });
    if (!adjustment) { res.status(404).json({ status: 404, detail: 'Adjustment not found' }); return; }
    await prisma.$transaction(async (tx: any) => {
      await tx.stockAdjustment.update({ where: { id: adjustment.id }, data: { approvedBy: req.user ? BigInt(req.user.userId) : 1, approvedAt: new Date() } });
      const qty = adjustment.quantityAdjusted;
      if (adjustment.adjustmentType === 'DECREASE') {
        await tx.warehouseStock.updateMany({ where: { tenantId, warehouseId: adjustment.warehouseId, productId: adjustment.productId }, data: { quantity: { decrement: qty } } });
      } else {
        await tx.warehouseStock.upsert({
          where: { tenantId_warehouseId_productId: { tenantId, warehouseId: adjustment.warehouseId, productId: adjustment.productId } },
          create: { tenantId, warehouseId: adjustment.warehouseId, productId: adjustment.productId, quantity: qty, averageCost: 0 },
          update: { quantity: { increment: qty } },
        });
      }
      await tx.stockMovement.create({
        data: { tenantId, warehouseId: adjustment.warehouseId, productId: adjustment.productId, movementType: 'ADJUSTMENT', quantity: adjustment.adjustmentType === 'DECREASE' ? -qty : qty, unitCost: 0, referenceType: 'stock_adjustment', referenceId: adjustment.id, createdBy: req.user ? BigInt(req.user.userId) : 1 },
      });
    });
    res.json({ data: { message: 'Adjustment approved' } });
  } catch (error: any) { logger.error('Adjustment approve failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

// ---- Stock Transfers ----
router.get('/transfers', rbacMiddleware('inventory.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [], meta: {} }); return; }
    const page = Number(req.query.page) || 1;
    const [items, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * 20, take: 20,
        include: { fromWarehouse: { select: { name: true } }, toWarehouse: { select: { name: true } }, items: { include: { product: { select: { name: true, sku: true } } } } },
      }),
      prisma.stockTransfer.count({ where: { tenantId: ctx.tenantId } }),
    ]);
    res.json({
      data: items.map((t: any) => ({
        id: t.id.toString(),
        transferNumber: t.transferNumber,
        fromWarehouseId: t.fromWarehouseId.toString(),
        fromWarehouseName: t.fromWarehouse?.name,
        toWarehouseId: t.toWarehouseId.toString(),
        toWarehouseName: t.toWarehouse?.name,
        transferDate: t.transferDate,
        reason: t.reason,
        notes: t.notes,
        status: t.status,
        itemCount: t.items?.length || 0,
        createdAt: t.createdAt,
        items: t.items?.map((i: any) => ({
          id: i.id.toString(),
          productId: i.productId.toString(),
          productName: i.product?.name,
          productSku: i.product?.sku,
          quantity: i.quantity,
          notes: i.notes,
        })) || [],
      })),
      meta: { total, page },
    });
  } catch { res.json({ data: [], meta: {} }); }
});

router.get('/transfers/:id', rbacMiddleware('inventory.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const t = await prisma.stockTransfer.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      include: { fromWarehouse: { select: { name: true } }, toWarehouse: { select: { name: true } }, items: { include: { product: { select: { name: true, sku: true } } } } },
    });
    if (!t) { res.status(404).json({ status: 404 }); return; }
    res.json({
      data: {
        id: t.id.toString(),
        transferNumber: t.transferNumber,
        fromWarehouseId: t.fromWarehouseId.toString(),
        fromWarehouseName: t.fromWarehouse?.name,
        toWarehouseId: t.toWarehouseId.toString(),
        toWarehouseName: t.toWarehouse?.name,
        transferDate: t.transferDate,
        reason: t.reason,
        notes: t.notes,
        status: t.status,
        createdAt: t.createdAt,
        items: t.items.map((i: any) => ({
          id: i.id.toString(),
          productId: i.productId.toString(),
          productName: i.product?.name,
          productSku: i.product?.sku,
          quantity: i.quantity,
          notes: i.notes,
        })),
      },
    });
  } catch { logger.error('Transfer detail failed'); res.status(500).json({ status: 500 }); }
});

router.post('/transfers', rbacMiddleware('inventory.transfer'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { fromWarehouseId, toWarehouseId, items, transferDate, reason, notes } = req.body;
    if (!fromWarehouseId || !toWarehouseId || !items || items.length === 0) {
      res.status(400).json({ status: 400, detail: 'fromWarehouseId, toWarehouseId, and items required' }); return;
    }
    if (fromWarehouseId === toWarehouseId) {
      res.status(400).json({ status: 400, detail: 'Source and destination warehouses must be different' }); return;
    }
    const tenantId = ctx.tenantId;
    const [fromWh, toWh] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: BigInt(fromWarehouseId), tenantId } }),
      prisma.warehouse.findFirst({ where: { id: BigInt(toWarehouseId), tenantId } }),
    ]);
    if (!fromWh || !toWh) {
      res.status(400).json({ status: 400, detail: 'Warehouse not found' }); return;
    }
    // FK ownership: every transferred product must belong to this tenant.
    for (const item of items) {
      const product = await prisma.product.findFirst({ where: { id: BigInt(item.productId), tenantId }, select: { id: true } });
      if (!product) { res.status(403).json({ status: 403, detail: `Product ${item.productId} not found or not accessible` }); return; }
    }
    const transferNumber = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
    const result = await prisma.$transaction(async (tx: any) => {
      for (const item of items) {
        const stock = await tx.warehouseStock.findFirst({
          where: { tenantId, warehouseId: BigInt(fromWarehouseId), productId: BigInt(item.productId) },
        });
        if (!stock || stock.quantity < item.quantity) {
          throw new Error(`Insufficient stock for product ${item.productId}. Available: ${stock?.quantity || 0}, Requested: ${item.quantity}`);
        }
      }
      const transfer = await tx.stockTransfer.create({
        data: {
          tenantId, transferNumber, fromWarehouseId: BigInt(fromWarehouseId), toWarehouseId: BigInt(toWarehouseId),
          transferDate: transferDate ? new Date(transferDate) : new Date(),
          reason: reason || null, notes: notes || null,
          createdBy: req.user ? BigInt(req.user.userId) : null,
          items: {
            create: items.map((i: any) => ({
              productId: BigInt(i.productId), quantity: i.quantity, notes: i.notes || null,
            })),
          },
        },
        include: { items: true },
      });
      for (const item of items) {
        await tx.warehouseStock.update({
          where: { tenantId_warehouseId_productId: { tenantId, warehouseId: BigInt(fromWarehouseId), productId: BigInt(item.productId) } },
          data: { quantity: { decrement: item.quantity } },
        });
        await tx.warehouseStock.upsert({
          where: { tenantId_warehouseId_productId: { tenantId, warehouseId: BigInt(toWarehouseId), productId: BigInt(item.productId) } },
          create: { tenantId, warehouseId: BigInt(toWarehouseId), productId: BigInt(item.productId), quantity: item.quantity, averageCost: 0 },
          update: { quantity: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: { tenantId, warehouseId: BigInt(fromWarehouseId), productId: BigInt(item.productId), movementType: 'TRANSFER_OUT', quantity: -item.quantity, unitCost: 0, referenceType: 'stock_transfer', referenceId: transfer.id, notes: notes || null, createdBy: req.user ? BigInt(req.user.userId) : null },
        });
        await tx.stockMovement.create({
          data: { tenantId, warehouseId: BigInt(toWarehouseId), productId: BigInt(item.productId), movementType: 'TRANSFER_IN', quantity: item.quantity, unitCost: 0, referenceType: 'stock_transfer', referenceId: transfer.id, notes: notes || null, createdBy: req.user ? BigInt(req.user.userId) : null },
        });
        const batch = await tx.stockBatch.findFirst({
          where: { tenantId, warehouseId: BigInt(fromWarehouseId), productId: BigInt(item.productId), quantityRemaining: { gt: 0 } },
          orderBy: { receivedAt: 'asc' },
        });
        if (batch) {
          const consume = Math.min(item.quantity, batch.quantityRemaining);
          await tx.stockBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { decrement: consume } } });
        }
        await tx.stockBatch.create({
          data: { tenantId, warehouseId: BigInt(toWarehouseId), productId: BigInt(item.productId), batchNumber: `TRF-${Date.now()}`, quantityReceived: item.quantity, quantityRemaining: item.quantity, unitCost: batch ? batch.unitCost : 0, receivedAt: new Date() },
        });
      }
      return transfer;
    });
    logger.info('Stock transfer completed', { transferNumber, items: items.length, tenantId: tenantId.toString() });
    void logActivity({
      tenantId, userId: req.user ? BigInt(req.user.userId) : undefined,
      action: 'STOCK_TRANSFER', entityType: 'stock_transfer', entityId: result.id,
      description: `Transfer ${transferNumber} completed: ${items.length} item(s) from ${fromWh.name} to ${toWh.name}`,
      newValues: {
        transferNumber, fromWarehouseId, toWarehouseId,
        fromWarehouse: fromWh.name, toWarehouse: toWh.name,
        items: items.map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
      },
      ipAddress: req.ip || '', userAgent: (req.headers['user-agent'] as string) || '',
    });
    res.status(201).json({ data: { id: result.id.toString(), transferNumber: result.transferNumber, itemCount: items.length } });
  } catch (error: any) {
    res.status(400).json({ status: 400, detail: error.message });
  }
});

export default router;
