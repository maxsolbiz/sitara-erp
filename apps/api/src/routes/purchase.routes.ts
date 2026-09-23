import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { purchaseService } from '../services/purchase.service';
import { rbacMiddleware } from '../middleware/rbac';
import { getDefaultWarehouse } from '../utils/warehouse';
import { ACCOUNT_CODES } from '../constants/accounts';
import { parseIdParam, requireAuthUserId } from '../utils/helpers';
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

// ---- PO ORDERS ----
router.get('/orders/stats', rbacMiddleware('purchases.view'), async (_req: Request, res: Response) => {
  try { const s = await purchaseService.getStats(); res.json({ data: s }); }
  catch (error: any) { logger.warn('Purchase stats failed', { error: error.message }); res.json({ data: { total: 0, pending: 0, partial: 0, received: 0, cancelled: 0 } }); }
});

router.get('/orders', rbacMiddleware('purchases.view'), async (req: Request, res: Response) => {
  try {
    const r = await purchaseService.listOrders({
      search: req.query.search as string, status: req.query.status as string,
      vendorId: req.query.vendorId ? Number(req.query.vendorId) : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
    });
    res.json({ data: r.items, meta: { total: r.total, page: r.page } });
  } catch (e: any) { logger.error('PO list failed', { error: e.message }); res.status(500).json({ status: 500 }); }
});

router.get('/orders/export/csv', rbacMiddleware('purchases.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const orders = await prisma.purchaseOrder.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { orderDate: 'desc' },
      select: { orderNumber: true, orderDate: true, status: true, totalAmount: true, vendor: { select: { companyName: true } }, _count: { select: { items: true } } },
    });
    const headers = ['Order No','Vendor','Date','Status','Total Amount','Items Count'];
    const rows = orders.map(o => [
      o.orderNumber, o.vendor.companyName, o.orderDate.toISOString().slice(0, 10),
      o.status, Number(o.totalAmount), o._count.items,
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="purchase-orders-${new Date().toISOString().slice(0,10)}.csv"`);
    return res.send(csv);
  } catch { logger.error('PO export failed'); res.status(500).json({ status: 500, detail: 'Failed to export purchase orders' }); }
});

router.get('/orders/:id', rbacMiddleware('purchases.view'), async (req: Request, res: Response) => {
    try { const o = await purchaseService.getOrder(BigInt(req.params.id)); if (!o) { res.status(404).json({ status: 404 }); return; } res.json({ data: o }); }
    catch { logger.error('PO detail failed'); res.status(500).json({ status: 500 }); }
});

router.post('/orders', rbacMiddleware('purchases.create'), async (req: Request, res: Response) => {
  try { const r = await purchaseService.createOrder(req.body); res.status(201).json({ data: r }); }
  catch (e: any) { logger.error('PO create failed', { error: e.message }); res.status(500).json({ status: 500, detail: e.message }); }
});

// ---- RECEIPTS (GRN) ----
router.get('/receipts', rbacMiddleware('purchases.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const page = Number(req.query.page) || 1; const perPage = 20;
    const [items, total] = await Promise.all([
      prisma.purchaseReceipt.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * perPage, take: perPage,
        include: { purchaseOrder: { select: { orderNumber: true, vendor: { select: { companyName: true } } } }, items: { select: { quantityReceived: true } } },
      }),
      prisma.purchaseReceipt.count({ where: { tenantId: ctx.tenantId } }),
    ]);
    res.json({ data: items.map((r) => ({ id: r.id.toString(), receiptNumber: r.receiptNumber, orderNumber: r.purchaseOrder.orderNumber, vendorName: r.purchaseOrder.vendor.companyName, receiptDate: r.receiptDate, totalItems: r.totalItems, itemCount: r.items.length })), meta: { total, page } });
  } catch (error: any) { logger.warn('Purchase receipts failed', { error: error.message }); res.json({ data: [] }); }
});

router.get('/receipts/:id', rbacMiddleware('purchases.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const receipt = await prisma.purchaseReceipt.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      include: { purchaseOrder: { include: { vendor: { select: { companyName: true, phone: true } } } }, items: { include: { product: { select: { name: true, sku: true } } } }, warehouse: { select: { name: true } } },
    });
    if (!receipt) { res.status(404).json({ status: 404 }); return; }
    res.json({ data: { id: receipt.id.toString(), receiptNumber: receipt.receiptNumber, purchaseOrderId: receipt.purchaseOrderId.toString(), purchaseOrder: receipt.purchaseOrder, receiptDate: receipt.receiptDate, totalItems: receipt.totalItems, notes: receipt.notes, warehouse: receipt.warehouse, items: receipt.items.map((i: any) => ({ id: i.id.toString(), productId: i.productId.toString(), product: i.product, quantityReceived: i.quantityReceived, unitCost: Number(i.unitCost) })), totalValue: receipt.items.reduce((s: number, i: any) => s + Number(i.unitCost) * i.quantityReceived, 0) } });
  } catch { logger.error('Receipt detail failed'); res.status(500).json({ status: 500 }); }
});

router.get('/orders/:id/receipts', rbacMiddleware('purchases.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const receipts = await prisma.purchaseReceipt.findMany({
      where: { tenantId: ctx.tenantId, purchaseOrderId: BigInt(req.params.id) },
      include: { items: true, warehouse: { select: { name: true } } },
    });
    res.json({ data: receipts.map((r) => ({ id: r.id.toString(), receiptNumber: r.receiptNumber, receiptDate: r.receiptDate, totalItems: r.totalItems, warehouseName: r.warehouse?.name })) });
  } catch (error: any) { logger.warn('Order receipts failed', { error: error.message }); res.json({ data: [] }); }
});

router.post('/receipts', rbacMiddleware('purchases.receive'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { purchaseOrderId, receivedDate, referenceNumber, notes, items } = req.body;
    if (!purchaseOrderId || !items || items.length === 0) { res.status(400).json({ status: 400, detail: 'PO ID and items required' }); return; }
    const tenantId = ctx.tenantId;

    const po = await prisma.purchaseOrder.findFirst({
      where: { id: BigInt(purchaseOrderId), tenantId },
      include: { vendor: { select: { id: true, currentBalance: true } }, items: true },
    });
    if (!po) { res.status(404).json({ status: 404, detail: 'PO not found' }); return; }
    if (po.status === 'CANCELLED') { res.status(400).json({ status: 400, detail: 'PO is cancelled' }); return; }

    // FK ownership: every receipt warehouse and product must belong to
    // this tenant (the PO check above does not cover body-supplied FKs).
    for (const item of items) {
      const wh = await prisma.warehouse.findFirst({ where: { id: BigInt(item.warehouseId || 0), tenantId }, select: { id: true } });
      if (!wh) { res.status(403).json({ status: 403, detail: `Warehouse ${item.warehouseId} not found or not accessible` }); return; }
      const prod = await prisma.product.findFirst({ where: { id: BigInt(item.productId), tenantId }, select: { id: true } });
      if (!prod) { res.status(403).json({ status: 403, detail: `Product ${item.productId} not found or not accessible` }); return; }
    }

    const result = await prisma.$transaction(async (tx: any) => {
      const receiptNumber = `GRN-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
      let totalValue = 0; let itemCount = 0;

      const receipt = await tx.purchaseReceipt.create({
        data: {
          tenantId, receiptNumber, purchaseOrderId: BigInt(purchaseOrderId),
          warehouseId: BigInt(items[0].warehouseId || 0), receiptDate: receivedDate ? new Date(receivedDate) : new Date(),
          totalItems: items.length, notes: notes || null, receivedBy: requireAuthUserId(req),
        },
      });

      for (const item of items) {
        const poiId = BigInt(item.purchaseOrderItemId);

        // Validate PO item
        const poi = await tx.purchaseOrderItem.findFirst({ where: { id: poiId, purchaseOrderId: BigInt(purchaseOrderId), tenantId } });
        if (!poi) throw new Error(`PO item ${item.purchaseOrderItemId} not found`);

        const qty = item.quantityReceived || 0;
        if (qty <= 0) continue;
        const unitCost = item.unitCost || Number(poi.unitCost);
        const lineTotal = qty * unitCost;
        totalValue += lineTotal; itemCount++;

        const whId = BigInt(item.warehouseId || 0);

        // Create receipt item
        await tx.purchaseReceiptItem.create({
          data: { tenantId, purchaseReceiptId: receipt.id, purchaseOrderItemId: poiId, productId: BigInt(item.productId), quantityReceived: qty, unitCost, batchNumber: item.batchNumber || null },
        });

        // Update PO item received qty
        const newReceived = Number(poi.quantityReceived) + qty;
        await tx.purchaseOrderItem.update({ where: { id: poiId }, data: { quantityReceived: newReceived } });

        // Upsert warehouse stock
        await tx.warehouseStock.upsert({
          where: { tenantId_warehouseId_productId: { tenantId, warehouseId: whId, productId: BigInt(item.productId) } },
          create: { tenantId, warehouseId: whId, productId: BigInt(item.productId), quantity: qty, averageCost: unitCost },
          update: { quantity: { increment: qty } },
        });

        // Create stock batch (FIFO)
        await tx.stockBatch.create({
          data: { tenantId, warehouseId: whId, productId: BigInt(item.productId), batchNumber: `PO-${receiptNumber}-${Date.now()}`, quantityReceived: qty, quantityRemaining: qty, unitCost, receivedAt: new Date() },
        });

        // Stock movement
        await tx.stockMovement.create({
          data: { tenantId, warehouseId: whId, productId: BigInt(item.productId), movementType: 'PURCHASE_IN', quantity: qty, unitCost, referenceType: 'purchase_receipt', referenceId: receipt.id, createdBy: requireAuthUserId(req) },
        });
      }

      // Update receipt total items
      await tx.purchaseReceipt.update({ where: { id: receipt.id }, data: { totalItems: itemCount } });

      // Update PO status
      const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: BigInt(purchaseOrderId), tenantId } });
      const allFullyReceived = allItems.every((i: any) => Number(i.quantityReceived) >= i.quantityOrdered);
      const anyReceived = allItems.some((i: any) => Number(i.quantityReceived) > 0);
      const poStatus = allFullyReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'CONFIRMED';
      await tx.purchaseOrder.update({ where: { id: BigInt(purchaseOrderId) }, data: { status: poStatus } });

      // Journal entry: Dr Inventory, Cr Accounts Payable
      if (totalValue > 0) {
        const [invAcct, apAcct] = await Promise.all([
          tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.INVENTORY } } }),
          tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE } } }),
        ]);
        if (invAcct && apAcct) {
          await tx.journalEntry.create({
            data: {
              tenantId, entryNumber: `GRN-${receiptNumber.replace('GRN-', '')}`, entryDate: new Date(),
              description: `GRN ${receiptNumber} for PO ${po.orderNumber}`,
              totalDebit: totalValue, totalCredit: totalValue,
              createdBy: requireAuthUserId(req),
              lines: { create: [{ tenantId, accountId: invAcct.id, debitAmount: totalValue, creditAmount: 0, description: 'Inventory received' }, { tenantId, accountId: apAcct.id, debitAmount: 0, creditAmount: totalValue, description: `PO ${po.orderNumber}` }] },
            },
          });
        }
      }

      // Update vendor balance
      const vendorBefore = Number(po.vendor.currentBalance);
      await tx.vendor.update({ where: { id: po.vendorId }, data: { currentBalance: { increment: totalValue } } });
      await tx.vendorLedger.create({
        data: { tenantId, vendorId: po.vendorId, type: 'PURCHASE', amount: totalValue, balanceBefore: vendorBefore, balanceAfter: vendorBefore + totalValue, referenceId: receipt.id, referenceType: 'purchase_receipt', notes: `GRN ${receiptNumber}`, createdBy: requireAuthUserId(req) },
      });

      return { id: receipt.id.toString(), receiptNumber };
    });

    logger.info('Receipt created', { receiptNumber: result.receiptNumber, tenantId: tenantId.toString() });
    res.status(201).json({ data: { ...result, message: 'Receipt created' } });
  } catch (error: any) { logger.error('Receipt create failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

// ---- PURCHASE RETURNS ----
router.get('/returns', rbacMiddleware('purchases.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const page = Number(req.query.page) || 1;
    const [items, total] = await Promise.all([
      prisma.purchaseReturn.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * 20, take: 20,
        include: { vendor: { select: { companyName: true } }, items: true },
      }),
      prisma.purchaseReturn.count({ where: { tenantId: ctx.tenantId } }),
    ]);
    res.json({ data: items.map((r) => ({ id: r.id.toString(), returnNumber: r.returnNumber, vendorName: r.vendor.companyName, returnDate: r.returnDate, totalAmount: Number(r.totalAmount), reason: r.reason, status: r.status, itemCount: r.items.length })), meta: { total, page } });
  } catch (error: any) { logger.warn('Purchase returns failed', { error: error.message }); res.json({ data: [] }); }
});

router.get('/returns/:id', rbacMiddleware('purchases.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const ret = await prisma.purchaseReturn.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      include: { vendor: { select: { companyName: true } }, items: { include: { product: { select: { name: true, sku: true } } } } },
    });
    if (!ret) { res.status(404).json({ status: 404 }); return; }
    res.json({ data: { id: ret.id.toString(), returnNumber: ret.returnNumber, purchaseOrderId: ret.purchaseOrderId?.toString() || null, vendorId: ret.vendorId.toString(), vendor: ret.vendor, returnDate: ret.returnDate, totalAmount: Number(ret.totalAmount), reason: ret.reason, status: ret.status, items: ret.items.map((i: any) => ({ id: i.id.toString(), productId: i.productId.toString(), product: i.product, quantityReturned: i.quantityReturned, unitCost: Number(i.unitCost), lineTotal: Number(i.lineTotal) })), createdAt: ret.createdAt } });
  } catch { logger.error('Purchase return detail failed'); res.status(500).json({ status: 500 }); }
});

router.post('/returns', rbacMiddleware('purchases.returns.create'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { purchaseOrderId, vendorId, returnDate, reason, items } = req.body;
    if (!vendorId || !items || items.length === 0) { res.status(400).json({ status: 400, detail: 'Vendor ID and items required' }); return; }
    for (const item of items) {
      if (!item.receiptItemId) { res.status(400).json({ status: 400, detail: 'receiptItemId is required for every item' }); return; }
      if (!Number.isInteger(item.quantityReturned) || item.quantityReturned <= 0) { res.status(400).json({ status: 400, detail: `Quantity must be a positive integer for receipt item ${item.receiptItemId}` }); return; }
    }
    const tenantId = ctx.tenantId;

    const vendor = await prisma.vendor.findFirst({ where: { id: BigInt(vendorId), tenantId } });
    if (!vendor) { res.status(404).json({ status: 404, detail: 'Vendor not found' }); return; }

    // FK ownership: optional PO plus every receipt line must belong to this
    // tenant. productId, unitCost and warehouseId are ALWAYS derived
    // server-side from the receipt item, never from the request body.
    if (purchaseOrderId) {
      const po = await prisma.purchaseOrder.findFirst({ where: { id: BigInt(purchaseOrderId), tenantId }, select: { id: true } });
      if (!po) { res.status(403).json({ status: 403, detail: 'Purchase order not found or not accessible' }); return; }
    }
    let receiptItemIds: bigint[];
    try {
      receiptItemIds = items.map((i: any) => BigInt(i.receiptItemId));
    } catch {
      res.status(400).json({ status: 400, detail: 'Invalid receiptItemId' }); return;
    }
    const receiptItems = await prisma.purchaseReceiptItem.findMany({
      where: { tenantId, id: { in: receiptItemIds } },
      select: { id: true, productId: true, quantityReceived: true, unitCost: true, purchaseReceiptId: true, purchaseReceipt: { select: { warehouseId: true } } },
    });
    const receiptItemMap = new Map(receiptItems.map((ri) => [ri.id.toString(), ri]));
    for (const item of items) {
      if (!receiptItemMap.has(String(item.receiptItemId))) { res.status(400).json({ status: 400, detail: `Receipt item ${item.receiptItemId} not found or not accessible` }); return; }
    }

    const result = await prisma.$transaction(async (tx: any) => {
      // Remaining-quantity check against a fresh read inside the transaction:
      // received minus already-returned (PENDING + APPROVED rows), plus what
      // this same request already claimed per receipt item.
      const priorReturned = await tx.purchaseReturnItem.groupBy({
        by: ['receiptItemId'],
        where: { tenantId, receiptItemId: { in: receiptItemIds }, purchaseReturn: { status: { in: ['PENDING', 'APPROVED'] } } },
        _sum: { quantityReturned: true },
      });
      const priorMap = new Map<string, number>(priorReturned.map((p: any): [string, number] => [p.receiptItemId.toString(), Number(p._sum.quantityReturned) || 0]));
      const claimedInThisRequest = new Map<string, number>();

      const resolvedItems = items.map((item: any) => {
        const ri = receiptItemMap.get(String(item.receiptItemId))!;
        const key = String(item.receiptItemId);
        const already = (priorMap.get(key) || 0) + (claimedInThisRequest.get(key) || 0);
        const remaining = ri.quantityReceived - already;
        if (item.quantityReturned > remaining) {
          throw new Error(`REJECT:400:Quantity ${item.quantityReturned} exceeds remaining returnable quantity ${remaining} for receipt item ${item.receiptItemId}`);
        }
        claimedInThisRequest.set(key, already + item.quantityReturned);
        const unitCost = Number(ri.unitCost);
        return { receiptItemId: ri.id, productId: ri.productId, quantity: item.quantityReturned, unitCost, lineTotal: item.quantityReturned * unitCost, warehouseId: ri.purchaseReceipt.warehouseId };
      });

      const totalAmount = resolvedItems.reduce((s: number, i: any) => s + i.lineTotal, 0);
      const returnNumber = `PRET-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;

      // Created PENDING with NO stock/journal/vendor effects - those fire
      // only on approve (see PATCH /returns/:id/approve below).
      const ret = await tx.purchaseReturn.create({
        data: {
          tenantId, returnNumber, purchaseOrderId: purchaseOrderId ? BigInt(purchaseOrderId) : null,
          vendorId: BigInt(vendorId), returnDate: returnDate ? new Date(returnDate) : new Date(),
          totalAmount, reason: reason || 'Other', status: 'PENDING', createdBy: requireAuthUserId(req),
        },
      });

      for (const item of resolvedItems) {
        await tx.purchaseReturnItem.create({
          data: { tenantId, purchaseReturnId: ret.id, receiptItemId: item.receiptItemId, productId: item.productId, quantityReturned: item.quantity, unitCost: item.unitCost, lineTotal: item.lineTotal },
        });
      }

      return { id: ret.id.toString(), returnNumber };
    });

    logger.info('Purchase return created', { returnNumber: result.returnNumber, tenantId: tenantId.toString() });
    res.status(201).json({ data: result });
  } catch (error: any) {
    const m = /^REJECT:(\d+):(.*)$/.exec(error.message || '');
    if (m) { res.status(Number(m[1])).json({ status: Number(m[1]), detail: m[2] }); return; }
    logger.error('Purchase return failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message });
  }
});

router.patch('/returns/:id/approve', rbacMiddleware('purchases.returns.approve'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const tenantId = ctx.tenantId;
    const ret = await prisma.purchaseReturn.findFirst({
      where: { id: BigInt(req.params.id), tenantId },
      include: { items: true },
    });
    if (!ret) { res.status(404).json({ status: 404, detail: 'Return not found' }); return; }
    if (ret.status !== 'PENDING') { res.status(400).json({ status: 400, detail: `Return is already ${ret.status}` }); return; }

    await prisma.$transaction(async (tx: any) => {
      // Re-check remaining quantity against fresh data: time has passed
      // since create, and another approval may have consumed it since.
      const receiptItemIds = ret.items.map((i: any) => i.receiptItemId);
      const priorReturned = await tx.purchaseReturnItem.groupBy({
        by: ['receiptItemId'],
        where: { tenantId, receiptItemId: { in: receiptItemIds }, purchaseReturn: { status: { in: ['PENDING', 'APPROVED'] } } },
        _sum: { quantityReturned: true },
      });
      const priorMap = new Map<string, number>(priorReturned.map((p: any): [string, number] => [p.receiptItemId.toString(), Number(p._sum.quantityReturned) || 0]));
      // This return's own PENDING rows are included in priorMap (they were
      // written at create time), so subtract this return's per-item totals
      // first: a return only competes with OTHER returns, not with itself.
      const ownTotals = new Map<string, number>();
      for (const item of ret.items) {
        const key = item.receiptItemId.toString();
        ownTotals.set(key, (ownTotals.get(key) || 0) + Number(item.quantityReturned));
      }
      const claimedInThisRequest = new Map<string, number>();
      for (const item of ret.items) {
        const receiptItem = await tx.purchaseReceiptItem.findFirst({
          where: { id: item.receiptItemId, tenantId },
          select: { quantityReceived: true },
        });
        if (!receiptItem) {
          throw new Error(`REJECT:400:Receipt item ${item.receiptItemId.toString()} not found or not accessible`);
        }
        const key = item.receiptItemId.toString();
        const others = (priorMap.get(key) || 0) - (ownTotals.get(key) || 0);
        const claimed = claimedInThisRequest.get(key) || 0;
        const remaining = receiptItem.quantityReceived - others - claimed;
        if (Number(item.quantityReturned) > remaining) {
          throw new Error(`REJECT:400:Quantity ${item.quantityReturned} exceeds remaining returnable quantity ${remaining} for receipt item ${key}`);
        }
        claimedInThisRequest.set(key, claimed + Number(item.quantityReturned));
      }

      for (const item of ret.items) {
        const qty = Number(item.quantityReturned);
        const unitCost = Number(item.unitCost);
        const receiptItem = await tx.purchaseReceiptItem.findFirst({
          where: { id: item.receiptItemId, tenantId },
          select: { productId: true, purchaseReceipt: { select: { warehouseId: true } } },
        });
        const productId = receiptItem!.productId;
        const whId = receiptItem!.purchaseReceipt.warehouseId;

        // Stock decrement WITH a floor check: insufficient stock rejects
        // instead of silently skipping (the old code skipped and still
        // moved the journal and vendor balance).
        const stock = await tx.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId } });
        if (!stock || Number(stock.quantity) < qty) {
          throw new Error(`REJECT:400:Insufficient stock for product ${productId.toString()} in warehouse ${whId.toString()}`);
        }
        await tx.warehouseStock.update({ where: { id: stock.id }, data: { quantity: { decrement: qty } } });

        // FIFO batch decrement WITH a floor: never drive negative.
        let stillToTake = qty;
        while (stillToTake > 0) {
          const fifoBatch = await tx.stockBatch.findFirst({
            where: { tenantId, warehouseId: whId, productId, quantityRemaining: { gt: 0 } },
            orderBy: { receivedAt: 'asc' },
          });
          if (!fifoBatch || Number(fifoBatch.quantityRemaining) <= 0) {
            throw new Error(`REJECT:400:Insufficient batch stock for product ${productId.toString()} in warehouse ${whId.toString()}`);
          }
          const take = Math.min(stillToTake, Number(fifoBatch.quantityRemaining));
          await tx.stockBatch.update({ where: { id: fifoBatch.id }, data: { quantityRemaining: { decrement: take } } });
          stillToTake -= take;
        }

        await tx.stockMovement.create({
          data: { tenantId, warehouseId: whId, productId, movementType: 'PURCHASE_RETURN', quantity: -qty, unitCost, referenceType: 'purchase_return', referenceId: ret.id, createdBy: requireAuthUserId(req) },
        });
      }

      const totalAmount = Number(ret.totalAmount);

      // Journal entry: Dr AP, Cr Inventory
      if (totalAmount > 0) {
        const [apAcct, invAcct] = await Promise.all([
          tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE } } }),
          tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.INVENTORY } } }),
        ]);
        if (apAcct && invAcct) {
          await tx.journalEntry.create({
            data: {
              tenantId, entryNumber: `PRET-${ret.returnNumber.replace('PRET-', '')}`, entryDate: new Date(),
              description: `Purchase return ${ret.returnNumber}`,
              totalDebit: totalAmount, totalCredit: totalAmount,
              createdBy: requireAuthUserId(req),
              lines: { create: [{ tenantId, accountId: apAcct.id, debitAmount: totalAmount, creditAmount: 0, description: 'Return to vendor' }, { tenantId, accountId: invAcct.id, debitAmount: 0, creditAmount: totalAmount, description: 'Inventory returned' }] },
            },
          });
        }
      }

      // Update vendor balance
      const vendor = await tx.vendor.findFirst({ where: { id: ret.vendorId, tenantId }, select: { id: true, currentBalance: true } });
      if (vendor) {
        const vendorBefore = Number(vendor.currentBalance);
        await tx.vendor.update({ where: { id: vendor.id }, data: { currentBalance: { decrement: totalAmount } } });
        await tx.vendorLedger.create({
          data: { tenantId, vendorId: vendor.id, type: 'RETURN', amount: totalAmount, balanceBefore: vendorBefore, balanceAfter: vendorBefore - totalAmount, referenceId: ret.id, referenceType: 'purchase_return', notes: `Return ${ret.returnNumber}`, createdBy: requireAuthUserId(req) },
        });
      }

      await tx.purchaseReturn.update({
        where: { id: ret.id },
        data: { status: 'APPROVED', approvedBy: requireAuthUserId(req), approvedAt: new Date() },
      });
    });

    res.json({ data: { message: 'Return approved' } });
  } catch (error: any) {
    const m = /^REJECT:(\d+):(.*)$/.exec(error.message || '');
    if (m) { res.status(Number(m[1])).json({ status: Number(m[1]), detail: m[2] }); return; }
    logger.error('Purchase return approve failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message });
  }
});

router.patch('/returns/:id/reject', rbacMiddleware('purchases.returns.approve'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const ret = await prisma.purchaseReturn.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!ret) { res.status(404).json({ status: 404, detail: 'Return not found' }); return; }
    if (ret.status !== 'PENDING') { res.status(400).json({ status: 400, detail: `Return is already ${ret.status}` }); return; }
    await prisma.purchaseReturn.updateMany({
      where: { id: ret.id, tenantId: ctx.tenantId, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });
    res.json({ data: { message: 'Return rejected' } });
  } catch (error: any) {
    const m = /^REJECT:(\d+):(.*)$/.exec(error.message || '');
    if (m) { res.status(Number(m[1])).json({ status: Number(m[1]), detail: m[2] }); return; }
    logger.error('Purchase return reject failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message });
  }
});

export default router;
