import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { purchaseService } from '../services/purchase.service';
import { rbacMiddleware } from '../middleware/rbac';
import { getDefaultWarehouse } from '../utils/warehouse';
import { ACCOUNT_CODES } from '../constants/accounts';
import { parseIdParam } from '../utils/helpers';
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
  catch { res.json({ data: { total: 0, pending: 0, partial: 0, received: 0, cancelled: 0 } }); }
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
  } catch { res.status(500).json({ status: 500, detail: 'Failed to export purchase orders' }); }
});

router.get('/orders/:id', rbacMiddleware('purchases.view'), async (req: Request, res: Response) => {
  try { const o = await purchaseService.getOrder(BigInt(req.params.id)); if (!o) { res.status(404).json({ status: 404 }); return; } res.json({ data: o }); }
  catch { res.status(500).json({ status: 500 }); }
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
  } catch { res.json({ data: [] }); }
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
  } catch { res.status(500).json({ status: 500 }); }
});

router.get('/orders/:id/receipts', rbacMiddleware('purchases.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const receipts = await prisma.purchaseReceipt.findMany({
      where: { tenantId: ctx.tenantId, purchaseOrderId: BigInt(req.params.id) },
      include: { items: true, warehouse: { select: { name: true } } },
    });
    res.json({ data: receipts.map((r) => ({ id: r.id.toString(), receiptNumber: r.receiptNumber, receiptDate: r.receiptDate, totalItems: r.totalItems, warehouseName: r.warehouse?.name })) });
  } catch { res.json({ data: [] }); }
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

    const result = await prisma.$transaction(async (tx: any) => {
      const receiptNumber = `GRN-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
      let totalValue = 0; let itemCount = 0;

      const receipt = await tx.purchaseReceipt.create({
        data: {
          tenantId, receiptNumber, purchaseOrderId: BigInt(purchaseOrderId),
          warehouseId: BigInt(items[0].warehouseId || 0), receiptDate: receivedDate ? new Date(receivedDate) : new Date(),
          totalItems: items.length, notes: notes || null, receivedBy: req.user ? BigInt(req.user.userId) : 1,
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
          data: { tenantId, warehouseId: whId, productId: BigInt(item.productId), movementType: 'PURCHASE_IN', quantity: qty, unitCost, referenceType: 'purchase_receipt', referenceId: receipt.id, createdBy: req.user ? BigInt(req.user.userId) : 1 },
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
              createdBy: req.user ? BigInt(req.user.userId) : 1,
              lines: { create: [{ tenantId, accountId: invAcct.id, debitAmount: totalValue, creditAmount: 0, description: 'Inventory received' }, { tenantId, accountId: apAcct.id, debitAmount: 0, creditAmount: totalValue, description: `PO ${po.orderNumber}` }] },
            },
          });
        }
      }

      // Update vendor balance
      const vendorBefore = Number(po.vendor.currentBalance);
      await tx.vendor.update({ where: { id: po.vendorId }, data: { currentBalance: { increment: totalValue } } });
      await tx.vendorLedger.create({
        data: { tenantId, vendorId: po.vendorId, type: 'PURCHASE', amount: totalValue, balanceBefore: vendorBefore, balanceAfter: vendorBefore + totalValue, referenceId: receipt.id, referenceType: 'purchase_receipt', notes: `GRN ${receiptNumber}`, createdBy: req.user ? BigInt(req.user.userId) : 1 },
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
  } catch { res.json({ data: [] }); }
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
  } catch { res.status(500).json({ status: 500 }); }
});

router.post('/returns', rbacMiddleware('purchases.returns'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { purchaseOrderId, vendorId, returnDate, reason, notes, items } = req.body;
    if (!vendorId || !items || items.length === 0) { res.status(400).json({ status: 400, detail: 'Vendor ID and items required' }); return; }
    const tenantId = ctx.tenantId;

    const vendor = await prisma.vendor.findFirst({ where: { id: BigInt(vendorId), tenantId } });
    if (!vendor) { res.status(404).json({ status: 404, detail: 'Vendor not found' }); return; }

    const result = await prisma.$transaction(async (tx: any) => {
      const returnNumber = `PRET-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
      const totalAmount = items.reduce((s: number, i: any) => s + (i.unitCost || 0) * (i.quantityReturned || 0), 0);

      const ret = await tx.purchaseReturn.create({
        data: {
          tenantId, returnNumber, purchaseOrderId: purchaseOrderId ? BigInt(purchaseOrderId) : null,
          vendorId: BigInt(vendorId), returnDate: returnDate ? new Date(returnDate) : new Date(),
          totalAmount, reason: reason || 'Other', status: 'APPROVED', createdBy: req.user ? BigInt(req.user.userId) : 1,
        },
      });

      for (const item of items) {
        const qty = item.quantityReturned || 0;
        if (qty <= 0) continue;
        const unitCost = item.unitCost || 0;
        const lineTotal = qty * unitCost;
        const whId = BigInt(item.warehouseId || 0);

        await tx.purchaseReturnItem.create({
          data: { tenantId, purchaseReturnId: ret.id, productId: BigInt(item.productId), quantityReturned: qty, unitCost, lineTotal },
        });

        // Decrement warehouse stock
        const stock = await tx.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: BigInt(item.productId) } });
        if (stock && stock.quantity >= qty) {
          await tx.warehouseStock.update({ where: { id: stock.id }, data: { quantity: { decrement: qty } } });
        }

        // Reduce earliest FIFO batch
        const fifoBatch = await tx.stockBatch.findFirst({
          where: { tenantId, warehouseId: whId, productId: BigInt(item.productId), quantityRemaining: { gt: 0 } },
          orderBy: { receivedAt: 'asc' },
        });
        if (fifoBatch) {
          await tx.stockBatch.update({ where: { id: fifoBatch.id }, data: { quantityRemaining: { decrement: qty } } });
        }

        await tx.stockMovement.create({
          data: { tenantId, warehouseId: whId, productId: BigInt(item.productId), movementType: 'PURCHASE_RETURN', quantity: -qty, unitCost, referenceType: 'purchase_return', referenceId: ret.id, createdBy: req.user ? BigInt(req.user.userId) : 1 },
        });
      }

      // Journal entry: Dr AP, Cr Inventory
      if (totalAmount > 0) {
        const [apAcct, invAcct] = await Promise.all([
          tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE } } }),
          tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.INVENTORY } } }),
        ]);
        if (apAcct && invAcct) {
          await tx.journalEntry.create({
            data: {
              tenantId, entryNumber: `PRET-${returnNumber.replace('PRET-', '')}`, entryDate: new Date(),
              description: `Purchase return ${returnNumber}`,
              totalDebit: totalAmount, totalCredit: totalAmount,
              createdBy: req.user ? BigInt(req.user.userId) : 1,
              lines: { create: [{ tenantId, accountId: apAcct.id, debitAmount: totalAmount, creditAmount: 0, description: 'Return to vendor' }, { tenantId, accountId: invAcct.id, debitAmount: 0, creditAmount: totalAmount, description: 'Inventory returned' }] },
            },
          });
        }
      }

      // Update vendor balance
      const vendorBefore = Number(vendor.currentBalance);
      await tx.vendor.update({ where: { id: vendor.id }, data: { currentBalance: { decrement: totalAmount } } });
      await tx.vendorLedger.create({
        data: { tenantId, vendorId: vendor.id, type: 'RETURN', amount: totalAmount, balanceBefore: vendorBefore, balanceAfter: vendorBefore - totalAmount, referenceId: ret.id, referenceType: 'purchase_return', notes: `Return ${returnNumber}`, createdBy: req.user ? BigInt(req.user.userId) : 1 },
      });

      return { id: ret.id.toString(), returnNumber };
    });

    logger.info('Purchase return created', { returnNumber: result.returnNumber, tenantId: tenantId.toString() });
    res.status(201).json({ data: result });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.patch('/returns/:id/approve', rbacMiddleware('purchases.returns'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    await prisma.purchaseReturn.updateMany({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      data: { status: 'APPROVED', approvedBy: req.user ? BigInt(req.user.userId) : 1, approvedAt: new Date() },
    });
    res.json({ data: { message: 'Return approved' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

export default router;
