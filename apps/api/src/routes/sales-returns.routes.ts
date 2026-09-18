import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import { getUserScope } from '../utils/scope';
import { getDefaultWarehouse } from '../utils/warehouse';
import { parseIdParam, requireAuthUserId } from '../utils/helpers';
import { ACCOUNT_CODES } from '../constants/accounts';
import { createNotification } from './notification.routes';
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

router.get('/', rbacMiddleware('sales.returns.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const scope = req.user ? await getUserScope(BigInt(req.user.userId), BigInt(req.user.tenantId)) : 'all';
    const baseWhere: any = { tenantId: ctx.tenantId };
    if (scope === 'own' && req.user) baseWhere.createdBy = BigInt(req.user.userId);
    const standalone = await prisma.salesReturn.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { customer: { select: { fullName: true } }, sale: { select: { saleNumber: true } } },
    });
    const standaloneReturns = standalone.map((r) => ({
      id: r.id.toString(), returnNumber: r.returnNumber, saleNumber: r.sale?.saleNumber || '',
      customerName: r.customer?.fullName || 'Unknown', totalAmount: Number(r.totalAmount),
      status: r.status, returnDate: r.returnDate.toISOString(), type: 'STANDALONE' as const,
    }));
    const embeddedWhere: any = { tenantId: ctx.tenantId, quantity: { lt: 0 } };
    if (scope === 'own' && req.user) embeddedWhere.createdBy = BigInt(req.user.userId);
    const embeddedItems = await prisma.saleItem.findMany({
      where: embeddedWhere,
      include: { sale: { include: { customer: { select: { fullName: true } } } }, product: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const embeddedMap = new Map<string, { sale: any; items: any[] }>();
    for (const item of embeddedItems) {
      const saleId = item.saleId.toString();
      if (!embeddedMap.has(saleId)) embeddedMap.set(saleId, { sale: item.sale, items: [] });
      embeddedMap.get(saleId)!.items.push(item);
    }
    const embeddedReturns: any[] = [];
    for (const [, group] of embeddedMap) {
      const totalAmount = group.items.reduce((s: number, i: any) => s + Math.abs(Number(i.lineTotal)), 0);
      embeddedReturns.push({ id: group.sale.id.toString(), returnNumber: `RET-${group.sale.saleNumber}`, saleNumber: group.sale.saleNumber, customerName: group.sale.customer?.fullName || 'Walk-in', totalAmount, status: 'COMPLETED', returnDate: group.sale.saleDate.toISOString(), type: 'EMBEDDED' as const });
    }
    const allReturns = [...standaloneReturns, ...embeddedReturns].sort((a, b) => new Date(b.returnDate).getTime() - new Date(a.returnDate).getTime());
    res.json({ data: allReturns });
  } catch (error: any) { logger.error('Sales returns list failed', { error: error.message }); res.json({ data: [] }); }
});

router.get('/:id', rbacMiddleware('sales.returns.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const ret = await prisma.salesReturn.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      include: { customer: { select: { fullName: true, phone: true } }, sale: { select: { saleNumber: true } }, items: { include: { product: { select: { name: true, sku: true } } } } },
    });
    if (!ret) { res.status(404).json({ status: 404 }); return; }
    res.json({ data: { id: ret.id.toString(), returnNumber: ret.returnNumber, saleNumber: ret.sale?.saleNumber, customerName: ret.customer?.fullName, customerPhone: ret.customer?.phone, returnDate: ret.returnDate, totalAmount: Number(ret.totalAmount), reason: ret.reason, status: ret.status, approvedBy: ret.approvedBy?.toString() || null, approvedAt: ret.approvedAt, rejectedBy: ret.rejectedBy?.toString() || null, rejectedAt: ret.rejectedAt, rejectionReason: ret.rejectionReason, items: ret.items.map((i) => ({ id: i.id.toString(), productId: i.productId.toString(), productName: i.product?.name, sku: i.product?.sku, quantityReturned: i.quantityReturned, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal) })), createdAt: ret.createdAt } });
  } catch { logger.error('Return detail failed'); res.status(500).json({ status: 500 }); }
});

router.patch('/:id/approve', rbacMiddleware('sales.returns.approve'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const tenantId = ctx.tenantId;
    const ret = await prisma.salesReturn.findFirst({
      where: { id: BigInt(req.params.id), tenantId },
      include: { items: true, customer: { select: { id: true, currentBalance: true } }, sale: { select: { id: true } } },
    });
    if (!ret) { res.status(404).json({ status: 404, detail: 'Return not found' }); return; }
    if (ret.status !== 'PENDING') { res.status(400).json({ status: 400, detail: `Return is already ${ret.status}` }); return; }

    const warehouseId = await getDefaultWarehouse(tenantId);
    const refundMethod = req.body.refundMethod || 'cash';
    let totalAmount = Number(ret.totalAmount);

    await prisma.$transaction(async (tx: any) => {
      for (const item of ret.items) {
        const qty = item.quantityReturned;
        await tx.warehouseStock.upsert({
          where: { tenantId_warehouseId_productId: { tenantId, warehouseId, productId: item.productId } },
          create: { tenantId, warehouseId, productId: item.productId, quantity: qty, averageCost: Number(item.unitPrice) },
          update: { quantity: { increment: qty } },
        });
        const batch = await tx.stockBatch.findFirst({
          where: { tenantId, warehouseId, productId: item.productId },
          orderBy: { receivedAt: 'desc' },
        });
        if (batch) await tx.stockBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { increment: qty } } });
        await tx.stockMovement.create({
          data: { tenantId, warehouseId, productId: item.productId, movementType: 'SALE_RETURN', quantity: qty, unitCost: Number(item.unitPrice), referenceType: 'sales_return', referenceId: ret.id, createdBy: requireAuthUserId(req) },
        });
      }

      // Refund
      if (refundMethod === 'credit' && ret.customerId) {
        const before = Number(ret.customer?.currentBalance || 0);
        await tx.customer.update({ where: { id: ret.customerId }, data: { currentBalance: { increment: totalAmount } } });
        await tx.customerLedger.create({ data: { tenantId, customerId: ret.customerId, type: 'REFUND', amount: totalAmount, balanceBefore: before, balanceAfter: before + totalAmount, referenceId: ret.id, referenceType: 'sales_return', notes: `Return ${ret.returnNumber}`, createdBy: requireAuthUserId(req) } });
      }

      // Journal entry
      const [returnsAcct, cashAcct, arAcct] = await Promise.all([
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.SALES_RETURNS } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.CASH_ON_HAND } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE } } }),
      ]);
      if (returnsAcct && totalAmount > 0) {
        const lines: any[] = [{ tenantId, accountId: returnsAcct.id, debitAmount: totalAmount, creditAmount: 0, description: `Return ${ret.returnNumber}` }];
        if (refundMethod === 'credit' && arAcct) lines.push({ tenantId, accountId: arAcct.id, debitAmount: 0, creditAmount: totalAmount, description: 'Credit refund' });
        else if (cashAcct) lines.push({ tenantId, accountId: cashAcct.id, debitAmount: 0, creditAmount: totalAmount, description: 'Cash refund' });
        const td = lines.reduce((s: number, l: any) => s + Number(l.debitAmount), 0);
        const tc = lines.reduce((s: number, l: any) => s + Number(l.creditAmount), 0);
        if (Math.abs(td - tc) > 0.01) throw new Error(`Journal not balanced: Dr ${td} != Cr ${tc}`);
        await tx.journalEntry.create({ data: { tenantId, entryNumber: `RET-${ret.returnNumber.replace('RET-', '')}`, entryDate: new Date(), description: `Return ${ret.returnNumber}`, totalDebit: td, totalCredit: tc, createdBy: requireAuthUserId(req), lines: { create: lines } } });
      }

      await tx.salesReturn.update({ where: { id: ret.id }, data: { status: 'APPROVED', approvedBy: requireAuthUserId(req), approvedAt: new Date() } });
    });

    logger.info('Return approved', { returnNumber: ret.returnNumber, tenantId: tenantId.toString() });
    res.json({ data: { message: 'Return approved' } });
  } catch (error: any) { logger.error('Return approve failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.patch('/:id/reject', rbacMiddleware('sales.returns.approve'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const ret = await prisma.salesReturn.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId } });
    if (!ret) { res.status(404).json({ status: 404, detail: 'Return not found' }); return; }
    if (ret.status !== 'PENDING') { res.status(400).json({ status: 400, detail: `Return is already ${ret.status}` }); return; }
    const { reason } = req.body;
    await prisma.salesReturn.update({ where: { id: ret.id }, data: { status: 'REJECTED', rejectedBy: requireAuthUserId(req), rejectedAt: new Date(), rejectionReason: reason || null } });
    res.json({ data: { message: 'Return rejected' } });
  } catch (error: any) { logger.error('Return reject failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.post('/', rbacMiddleware('sales.returns.create'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401, detail: 'No tenant' }); return; }
    const { saleId, items, reason } = req.body;
    if (!saleId || !items || items.length === 0) { res.status(400).json({ status: 400, detail: 'Sale ID and items required' }); return; }
    const sale = await prisma.sale.findFirst({
      where: { id: BigInt(saleId), tenantId: ctx.tenantId },
      include: { customer: true, items: { include: { product: { select: { id: true } } } } },
    });
    if (!sale) { res.status(404).json({ status: 404, detail: 'Sale not found' }); return; }
    if (!sale.customerId) { res.status(400).json({ status: 400, detail: 'Sale has no associated customer' }); return; }
    const saleItemMap = new Map(sale.items.map((si) => [si.id.toString(), si]));
    // FK ownership: items referencing sale items outside this sale fall back
    // to body-supplied productId/warehouseId — verify those belong to us.
    for (const i of items) {
      if (!saleItemMap.has(String(i.saleItemId))) {
        const prod = await prisma.product.findFirst({ where: { id: BigInt(i.productId || 0), tenantId: ctx.tenantId }, select: { id: true } });
        if (!prod) { res.status(403).json({ status: 403, detail: `Product ${i.productId} not found or not accessible` }); return; }
        const wh = await prisma.warehouse.findFirst({ where: { id: BigInt(i.warehouseId || 0), tenantId: ctx.tenantId }, select: { id: true } });
        if (!wh) { res.status(403).json({ status: 403, detail: `Warehouse ${i.warehouseId} not found or not accessible` }); return; }
      }
    }
    const returnNumber = `RET-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
    const totalAmount = items.reduce((s: number, i: any) => s + (i.quantity || 0) * (i.unitPrice || 0), 0);
    const result = await prisma.salesReturn.create({
      data: {
        tenantId: ctx.tenantId, returnNumber, saleId: BigInt(saleId), customerId: sale.customerId, returnDate: new Date(),
        totalAmount, reason: reason || 'Other', status: 'PENDING', createdBy: requireAuthUserId(req),
        items: { create: items.map((i: any) => {
          const si = saleItemMap.get(String(i.saleItemId));
          return { tenantId: ctx.tenantId, saleItemId: BigInt(i.saleItemId), productId: si ? si.productId : BigInt(i.productId || 0), quantityReturned: i.quantity, unitPrice: i.unitPrice || 0, lineTotal: (i.unitPrice || 0) * (i.quantity || 0), warehouseId: BigInt(i.warehouseId || 0) };
        }) },
      },
    });
    // Notify admins
    try {
      const admins = await prisma.user.findMany({ where: { tenantId: ctx.tenantId, isActive: true, roleAssignments: { some: { role: { slug: { in: ['admin', 'manager'] } } } } }, select: { id: true } });
      for (const u of admins) await createNotification({ tenantId: ctx.tenantId, userId: u.id, title: 'New Return Request', message: `${returnNumber} submitted for approval (PKR ${totalAmount})`, type: 'warning', link: '/sales/returns' });
    } catch { /* silent */ }

    logger.info('Return created', { returnNumber, saleId, tenantId: ctx.tenantId.toString() });
    res.status(201).json({ data: { id: result.id.toString(), returnNumber, status: 'PENDING' } });
  } catch (error: any) { logger.error('Return create failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

export default router;
