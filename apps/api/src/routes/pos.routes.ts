import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import { validateMiddleware } from '../middleware/validate';
import { generateSaleNumber, formatPkr, verifyPassword, parseIdParam, requireAuthUserId } from '../utils/helpers';
import { getDefaultWarehouse } from '../utils/warehouse';
import { printerService } from '../services/printer.service';
import { ACCOUNT_CODES } from '../constants/accounts';
import { getUserScope } from '../utils/scope';
import { createNotification } from './notification.routes';
import logger from '../utils/logger';

const router = Router();

// Reject malformed numeric IDs with 400 instead of 500/P2025 downstream
// (BigInt('') silently coerces to 0n; BigInt('abc') throws).
for (const name of ['id', 'saleId', 'returnId']) {
  router.param(name, (req, res, next, val) => {
    if (parseIdParam(val) === null) {
      res.status(400).json({ status: 400, title: 'Bad Request', detail: 'Invalid id parameter' });
      return;
    }
    next();
  });
}

const checkoutSchema = z.object({
  items: z.array(z.object({
    productId: z.number(),
    quantity: z.number().int().min(1),
    unitPrice: z.number().min(0),
    discountAmount: z.number().min(0).default(0),
  })).min(1),
  payments: z.array(z.object({
    method: z.enum(['CASH', 'BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA', 'CHEQUE', 'CREDIT', 'CARD']),
    amount: z.number().min(0),
    referenceNumber: z.string().optional(),
  })).min(1),
  customerId: z.number().optional(),
  warehouseId: z.number().optional(),
  discount: z.number().min(0).default(0),
  notes: z.string().optional(),
  tierId: z.number().optional(),
});

const checkoutSchema_basic = z.object({
  items: z.array(z.object({
    productId: z.number(),
    quantity: z.number().int().refine((v) => v !== 0, 'Quantity cannot be zero'),
    unitPrice: z.number().min(0),
    discountAmount: z.number().min(0).default(0),
  })).min(1),
  payments: z.array(z.object({
    method: z.string(),
    amount: z.number().min(0),
    referenceNumber: z.string().optional(),
  })).min(1),
  customerId: z.number().optional(),
  discount: z.number().min(0).default(0),
  notes: z.string().optional(),
  managerOverride: z.object({
    username: z.string(),
    password: z.string(),
  }).optional(),
});

router.get('/init', rbacMiddleware('pos.access'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const [products, categories, walkInCustomer, posSettings, hardwareSettings] = await Promise.all([
      prisma.product.findMany({
        where: { tenantId: ctx.tenantId, isActive: true },
        select: { id: true, name: true, sku: true, barcode: true, sellingPrice: true, categoryId: true, warehouseStock: { select: { quantity: true }, take: 1 } },
        take: 200,
      }),
      prisma.productCategory.findMany({ where: { tenantId: ctx.tenantId, isActive: true }, select: { id: true, name: true } }),
      prisma.customer.findFirst({ where: { tenantId: ctx.tenantId, customerCode: 'WALKIN' }, select: { id: true, fullName: true, phone: true, customerCode: true, creditLimit: true, currentBalance: true } }),
      prisma.setting.findFirst({ where: { tenantId: ctx.tenantId, key: 'pos' }, select: { value: true } }),
      prisma.setting.findFirst({ where: { tenantId: ctx.tenantId, key: 'hardware' }, select: { value: true } }),
    ]);
    res.json({
      data: {
        products: products.map((p) => ({ id: Number(p.id), name: p.name, sku: p.sku, barcode: p.barcode, sellingPrice: Number(p.sellingPrice), categoryId: p.categoryId ? Number(p.categoryId) : null, stock: p.warehouseStock.reduce((s, ws) => s + ws.quantity, 0) })),
        categories,
        walkInCustomer: walkInCustomer ? { id: Number(walkInCustomer.id), fullName: walkInCustomer.fullName, phone: walkInCustomer.phone, customerCode: walkInCustomer.customerCode, creditLimit: Number(walkInCustomer.creditLimit), currentBalance: Number(walkInCustomer.currentBalance) } : null,
        posSettings: posSettings?.value || {},
        hardwareSettings: hardwareSettings?.value || {},
      },
    });
  } catch { logger.error('POS init failed'); res.status(500).json({ status: 500, detail: 'Failed to load POS data' }); }
});

router.get('/', rbacMiddleware('pos.access'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.json({ data: { products: [], categories: [], heldSales: [] } }); return; }
    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: { tenantId: ctx.tenantId, isActive: true },
        select: { id: true, name: true, sku: true, barcode: true, sellingPrice: true, categoryId: true, warehouseStock: { select: { quantity: true }, take: 1 } },
        take: 200,
      }),
      prisma.productCategory.findMany({ where: { tenantId: ctx.tenantId, isActive: true }, select: { id: true, name: true } }),
    ]);
    res.json({
      data: {
        products: products.map((p) => ({ id: Number(p.id), name: p.name, sku: p.sku, barcode: p.barcode, sellingPrice: Number(p.sellingPrice), categoryId: p.categoryId ? Number(p.categoryId) : null, stock: p.warehouseStock.reduce((s, ws) => s + ws.quantity, 0) })),
        categories,
        heldSales: [],
      },
    });
  } catch (error: any) { logger.warn('POS init failed', { error: error.message }); res.json({ data: { products: [], categories: [], heldSales: [] } }); }
});

router.get('/products', rbacMiddleware('pos.access'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.json({ data: [] }); return; }
    const products = await prisma.product.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      select: { id: true, name: true, sku: true, barcode: true, sellingPrice: true, categoryId: true, warehouseStock: { select: { quantity: true }, take: 1 } },
      take: 200,
    });
    res.json({
      data: products.map((p) => ({
        id: Number(p.id), name: p.name, sku: p.sku, barcode: p.barcode,
        sellingPrice: Number(p.sellingPrice), categoryId: p.categoryId ? Number(p.categoryId) : null,
        stock: p.warehouseStock.reduce((s, ws) => s + ws.quantity, 0),
      })),
    });
  } catch (error: any) { logger.warn('POS products failed', { error: error.message }); res.json({ data: [] }); }
});

router.get('/products/search', rbacMiddleware('pos.access'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const q = (req.query.q as string) || '';
    const products = await prisma.product.findMany({
      where: { tenantId: ctx.tenantId, isActive: true, OR: [{ name: { contains: q, mode: 'insensitive' } }, { barcode: { contains: q } }, { sku: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, name: true, sku: true, barcode: true, sellingPrice: true, warehouseStock: { select: { quantity: true }, take: 1 } },
      take: 20,
    });
    res.json({ data: products.map((p) => ({ id: Number(p.id), name: p.name, sku: p.sku, barcode: p.barcode, sellingPrice: Number(p.sellingPrice), stock: p.warehouseStock.reduce((s, ws) => s + ws.quantity, 0) })) });
  } catch (error: any) { logger.warn('POS product search failed', { error: error.message }); res.json({ data: [] }); }
});

router.get('/held-sales', rbacMiddleware('pos.sales.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const scope = req.user ? await getUserScope(BigInt(req.user.userId), BigInt(req.user.tenantId)) : 'all';
    const where: any = { tenantId: ctx.tenantId, status: 'HELD' };
    if (scope === 'own' && req.user) where.heldBy = BigInt(req.user.userId);
    const held = await prisma.sale.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, include: { customer: { select: { fullName: true } }, items: true } });
    res.json({ data: held.map((s) => ({ id: s.id.toString(), saleNumber: s.saleNumber, customerName: s.customer?.fullName || 'Walk-in', total: Number(s.totalAmount), itemsCount: s.items.length, heldAt: s.heldAt?.toISOString() })) });
  } catch (error: any) { logger.warn('POS held sales failed', { error: error.message }); res.json({ data: [] }); }
});

router.post('/hold', rbacMiddleware('pos.sales.hold'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { items, customerId } = req.body;
    if (!items || items.length === 0) { res.status(400).json({ status: 400, detail: 'No items' }); return; }
    // FK ownership: customer (if given) and every product must belong to this tenant.
    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: BigInt(customerId), tenantId: ctx.tenantId }, select: { id: true } });
      if (!customer) { res.status(403).json({ status: 403, detail: 'Customer not found or not accessible' }); return; }
    }
    for (const i of items) {
      const product = await prisma.product.findFirst({ where: { id: BigInt(i.productId), tenantId: ctx.tenantId }, select: { id: true } });
      if (!product) { res.status(403).json({ status: 403, detail: `Product ${i.productId} not found or not accessible` }); return; }
    }
    const saleNumber = `HOLD-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
    const total = items.reduce((s: number, i: any) => s + (i.unitPrice * i.quantity), 0);

    const sale = await prisma.sale.create({
      data: {
        tenantId: ctx.tenantId, saleNumber, saleDate: new Date(), subtotal: total, totalAmount: total,
        status: 'HELD', heldBy: requireAuthUserId(req), heldAt: new Date(), customerId: customerId || null, createdBy: requireAuthUserId(req),
        items: { create: items.map((i: any) => ({ tenantId: ctx.tenantId, productId: BigInt(i.productId), quantity: i.quantity, unitPrice: i.unitPrice, unitCost: i.unitPrice || 0, lineTotal: i.lineTotal || (i.unitPrice * i.quantity), cogsAmount: 0, profitAmount: 0 })) },
      },
    });
    res.status(201).json({ data: { id: sale.id.toString(), saleNumber: sale.saleNumber } });
  } catch (error: any) { logger.error('POS hold failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.post('/resume/:id', rbacMiddleware('pos.sales.hold'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const sale = await prisma.sale.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId, status: 'HELD' },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    if (!sale) { res.status(404).json({ status: 404, detail: 'Held sale not found' }); return; }
    // Warn if held by a different cashier (non-blocking)
    if (sale.heldBy && req.user && sale.heldBy.toString() !== req.user.userId.toString()) {
      logger.warn('Resuming held sale by different cashier', { heldBy: sale.heldBy.toString(), resumedBy: req.user.userId, saleNumber: sale.saleNumber });
    }
    // Delete the held sale record
    await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
    await prisma.sale.delete({ where: { id: sale.id } });
    res.json({ data: { sale: { items: sale.items.map((i) => ({ productId: Number(i.productId), productName: i.product?.name, quantity: i.quantity, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal) })) } } });
  } catch (error: any) { logger.error('POS resume failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.get('/products-by-category', rbacMiddleware('pos.access'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const where: any = { tenantId: ctx.tenantId, isActive: true };
    if (req.query.category_id) where.categoryId = BigInt(req.query.category_id as string);
    const products = await prisma.product.findMany({ where, select: { id: true, name: true, sku: true, barcode: true, sellingPrice: true, categoryId: true, warehouseStock: { select: { quantity: true }, take: 1 } }, take: 200 });
    res.json({ data: products.map((p) => ({ id: Number(p.id), name: p.name, sku: p.sku, barcode: p.barcode, sellingPrice: Number(p.sellingPrice), categoryId: p.categoryId ? Number(p.categoryId) : null, stock: p.warehouseStock.reduce((s, ws) => s + ws.quantity, 0) })) });
  } catch (error: any) { logger.warn('POS products by category failed', { error: error.message }); res.json({ data: [] }); }
});

router.get('/daily-closing', rbacMiddleware('pos.sales.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: {} }); return; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const scope = req.user ? await getUserScope(BigInt(req.user.userId), BigInt(req.user.tenantId)) : 'all';
    const where: any = { tenantId: ctx.tenantId, saleDate: { gte: today }, status: 'COMPLETED' };
    if (scope === 'own' && req.user) where.createdBy = BigInt(req.user.userId);
    const sales = await prisma.sale.findMany({ where, include: { payments: true } });
    const totalSales = sales.reduce((s, sale) => s + Number(sale.totalAmount), 0);
    const paymentBreakdown: Record<string, number> = {};
    sales.forEach((s) => s.payments.forEach((p) => { paymentBreakdown[p.paymentMethod] = (paymentBreakdown[p.paymentMethod] || 0) + Number(p.amount); }));
    res.json({ data: { totalSales, transactionCount: sales.length, paymentBreakdown, averageOrder: sales.length > 0 ? totalSales / sales.length : 0 } });
  } catch (error: any) { logger.warn('POS daily closing failed', { error: error.message }); res.json({ data: {} }); }
});

// ---- RETURN ROUTES ----
router.get('/customer-purchases', rbacMiddleware('pos.sales.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [], meta: {} }); return; }
    const customerId = Number(req.query.customer_id);
    const page = Number(req.query.page) || 1;
    if (!customerId) { res.json({ data: [], meta: {} }); return; }
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const sales = await prisma.sale.findMany({
      where: { tenantId: ctx.tenantId, customerId, saleDate: { lt: cutoff }, status: 'COMPLETED' },
      orderBy: { saleDate: 'desc' }, skip: (page - 1) * 5, take: 5,
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    const total = await prisma.sale.count({ where: { tenantId: ctx.tenantId, customerId, saleDate: { lt: cutoff }, status: 'COMPLETED' } });
    const returnedIds = (await prisma.salesReturnItem.findMany({
      where: { tenantId: ctx.tenantId, salesReturn: { status: { in: ['APPROVED', 'APPLIED'] } } },
      select: { saleItemId: true },
    })).map((r) => r.saleItemId);
    res.json({
      data: sales.map((s) => ({
        saleId: s.id.toString(), saleNumber: s.saleNumber, saleDate: s.saleDate.toISOString(), total: Number(s.totalAmount),
        items: s.items.filter((i) => !returnedIds.includes(i.id)).map((i) => ({
          saleItemId: i.id.toString(), productId: Number(i.productId), productName: i.product?.name || `Item`,
          quantity: i.quantity, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal),
        })),
      })),
      meta: { total, page, totalPages: Math.ceil(total / 5) },
    });
  } catch (error: any) { logger.warn('POS customer purchases failed', { error: error.message }); res.json({ data: [], meta: {} }); }
});

router.get('/verify-purchase', rbacMiddleware('pos.sales.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: null }); return; }
    const customerId = Number(req.query.customer_id);
    const productId = Number(req.query.product_id);
    if (!customerId || !productId) { res.json({ data: null }); return; }
    const si = await prisma.saleItem.findFirst({
      where: { tenantId: ctx.tenantId, productId, sale: { customerId, status: 'COMPLETED' } },
      include: { sale: { select: { saleNumber: true, saleDate: true } }, product: { select: { name: true } } },
    });
    if (!si) { res.json({ data: null }); return; }
    res.json({ data: { saleItemId: si.id.toString(), saleNumber: si.sale.saleNumber, saleDate: si.sale.saleDate.toISOString(), productName: si.product?.name || `Product`, quantity: si.quantity, unitPrice: Number(si.unitPrice) } });
  } catch (error: any) { logger.warn('POS verify purchase failed', { error: error.message }); res.json({ data: null }); }
});

router.post('/process-return', rbacMiddleware('pos.returns.process'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { customerId, items, reason, refundMethod, notes, saleId } = req.body;
    if (!customerId || !items || items.length === 0) { res.status(400).json({ status: 400, detail: 'Items required' }); return; }

    const method = (refundMethod || 'cash').toLowerCase();
    const cust = customerId ? await prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId }, select: { customerCode: true, currentBalance: true } }) : null;
    if (method === 'credit') {
      if (!cust) { res.status(400).json({ status: 400, detail: 'Customer not found' }); return; }
      if (cust.customerCode === 'WALKIN') { res.status(400).json({ status: 400, detail: 'Walk-in customers cannot receive credit refunds' }); return; }
    }

    const firstItem = await prisma.saleItem.findFirst({
      where: { tenantId: ctx.tenantId, id: BigInt(items[0].saleItemId) },
      select: { saleId: true },
    });
    // FK ownership: when the first item doesn't resolve to an in-tenant
    // sale, the client-supplied saleId fallback must be verified — never
    // trusted blindly (BigInt(saleId || 0) would attach to id 0/foreign).
    let saleIdBigInt: bigint;
    if (firstItem?.saleId) {
      saleIdBigInt = firstItem.saleId;
    } else if (saleId) {
      const sale = await prisma.sale.findFirst({ where: { id: BigInt(saleId), tenantId: ctx.tenantId }, select: { id: true } });
      if (!sale) { res.status(403).json({ status: 403, detail: 'Sale not found or not accessible' }); return; }
      saleIdBigInt = sale.id;
    } else {
      res.status(400).json({ status: 400, detail: 'Sale item or sale required' }); return;
    }
    // FK ownership: every returned product must belong to this tenant.
    for (const item of items) {
      const product = await prisma.product.findFirst({ where: { id: BigInt(item.productId || 0), tenantId: ctx.tenantId }, select: { id: true } });
      if (!product) { res.status(403).json({ status: 403, detail: `Product ${item.productId} not found or not accessible` }); return; }
    }
    const returnNumber = `RET-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
    const totalAmount = items.reduce((s: number, i: any) => s + (i.unitPrice || 0) * i.quantity, 0);
    const tenantId = ctx.tenantId;
    const warehouseId = await getDefaultWarehouse(tenantId);

    const result = await prisma.$transaction(async (tx: any) => {
      const ret = await tx.salesReturn.create({
        data: { tenantId, saleId: saleIdBigInt, customerId: BigInt(customerId), returnNumber, returnDate: new Date(), totalAmount, reason: reason || 'Other', status: 'APPROVED', createdBy: requireAuthUserId(req) },
      });

      for (const item of items) {
        const qty = Math.abs(item.quantity);
        await tx.warehouseStock.upsert({
          where: { tenantId_warehouseId_productId: { tenantId, warehouseId, productId: BigInt(item.productId || 0) } },
          create: { tenantId, warehouseId, productId: BigInt(item.productId || 0), quantity: qty, averageCost: item.unitPrice || 0 },
          update: { quantity: { increment: qty } },
        });
        const batch = await tx.stockBatch.findFirst({ where: { tenantId, warehouseId, productId: BigInt(item.productId || 0) }, orderBy: { receivedAt: 'desc' } });
        const restoreCost = batch ? Number(batch.unitCost) : (item.unitPrice || 0);
        if (batch) await tx.stockBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { increment: qty } } });
        else await tx.stockBatch.create({ data: { tenantId, warehouseId, productId: BigInt(item.productId || 0), batchNumber: `RET-${Date.now()}`, quantityReceived: qty, quantityRemaining: qty, unitCost: restoreCost, receivedAt: new Date() } });
        await tx.stockMovement.create({ data: { tenantId, warehouseId, productId: BigInt(item.productId || 0), movementType: 'SALE_RETURN', quantity: qty, unitCost: restoreCost, referenceType: 'sales_return', referenceId: ret.id, createdBy: requireAuthUserId(req) } });
      }

      if (method === 'credit' && cust) {
        const before = Number(cust.currentBalance);
        await tx.customer.update({ where: { id: customerId }, data: { currentBalance: { increment: totalAmount } } });
        await tx.customerLedger.create({ data: { tenantId, customerId, type: 'REFUND', amount: totalAmount, balanceBefore: before, balanceAfter: before + totalAmount, referenceId: ret.id, referenceType: 'sales_return', notes: `Refund from return ${returnNumber}`, createdBy: requireAuthUserId(req) } });
      }

      const [returnsAcct, cashAcct, arAcct] = await Promise.all([
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.SALES_RETURNS } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.CASH_ON_HAND } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE } } }),
      ]);
      if (returnsAcct && totalAmount > 0) {
        const lines: any[] = [{ tenantId, accountId: returnsAcct.id, debitAmount: totalAmount, creditAmount: 0, description: `Return ${returnNumber}` }];
        if (method === 'credit' && arAcct) lines.push({ tenantId, accountId: arAcct.id, debitAmount: 0, creditAmount: totalAmount, description: 'Credit refund' });
        else if (cashAcct) lines.push({ tenantId, accountId: cashAcct.id, debitAmount: 0, creditAmount: totalAmount, description: 'Cash refund' });
        const td = lines.reduce((s: number, l: any) => s + Number(l.debitAmount), 0);
        const tc = lines.reduce((s: number, l: any) => s + Number(l.creditAmount), 0);
        if (Math.abs(td - tc) > 0.01) throw new Error(`Journal not balanced: Dr ${td} != Cr ${tc}`);
        await tx.journalEntry.create({ data: { tenantId, entryNumber: `RET-${returnNumber.replace('RET-', '')}`, entryDate: new Date(), description: `Return ${returnNumber}`, totalDebit: td, totalCredit: tc, createdBy: requireAuthUserId(req), lines: { create: lines } } });
      }
      return ret;
    });

    logger.info('Return processed', { returnNumber, customerId, totalAmount, method, tenantId: tenantId.toString() });
    res.status(201).json({ data: { returnId: result.id.toString(), returnNumber: result.returnNumber, total: totalAmount, status: result.status } });
    // Log return processing result (non-blocking)
    try {
      await prisma.returnProcessingLog.create({
        data: { tenantId: ctx.tenantId, saleId: saleIdBigInt, returnNumber, status: 'SUCCESS', errorMessage: null, cartData: items },
      });
    } catch {}
  } catch (error: any) { logger.error('Return failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

// ---- MANAGER OVERRIDE ----
router.post('/validate-manager', async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.status(401).json({ status: 401, detail: 'No tenant context' }); return; }
    const { username, password } = req.body;
    if (!username || !password) { res.status(400).json({ status: 400, detail: 'Username and password required' }); return; }
    const user = await prisma.user.findFirst({
      where: { username, tenantId: ctx.tenantId, isActive: true, status: 'active' },
      include: { roleAssignments: { include: { role: { select: { name: true } } } } },
    });
    if (!user) { res.status(401).json({ status: 401, detail: 'Invalid credentials' }); return; }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) { res.status(401).json({ status: 401, detail: 'Invalid credentials' }); return; }
    // Role check — only manager, admin, owner, or super admin can override
    const managerRoles = ['manager', 'admin', 'owner', 'administrator'];
    const userRoles = user.roleAssignments.map((ra: any) => ra.role.name.toLowerCase());
    const hasManagerRole = user.isSuperAdmin || userRoles.some((r: string) => managerRoles.includes(r));
    if (!hasManagerRole) {
      res.status(403).json({ status: 403, detail: 'User does not have manager privileges' }); return;
    }
    res.json({ data: { userId: user.id.toString(), fullName: user.fullName, verified: true } });
  } catch (error: any) { logger.error('Manager validation failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

// ---- CHECKOUT ----
router.post('/checkout', rbacMiddleware('pos.sales.create'), validateMiddleware(checkoutSchema_basic), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.status(401).json({ status: 401, detail: 'No tenant context' }); return; }

    // Offline sale deduplication
    const { offlineId, offlineCreatedAt, ...salePayload } = req.body;
    if (offlineId) {
      const existing = await prisma.sale.findFirst({ where: { offlineId, tenantId: ctx.tenantId }, select: { id: true, saleNumber: true } });
      if (existing) { return res.json({ success: true, data: { saleId: existing.id.toString(), saleNumber: existing.saleNumber, message: 'Already synced' } }); }
    }

    const { items, payments, customerId, discount, notes } = salePayload;
    const tenantId = ctx.tenantId;
    const warehouseId = await getDefaultWarehouse(tenantId);
    const saleNumber = generateSaleNumber();

    // Separate sale vs return items
    const saleItems = items.filter((i: any) => i.quantity > 0);
    const returnItems = items.filter((i: any) => i.quantity < 0);

    // FK ownership: every product on the ticket must belong to this tenant
    // (stock lookups below are tenant-scoped and would fail safe for sale
    // items, but return items skip stock validation — check explicitly).
    for (const i of items) {
      const product = await prisma.product.findFirst({ where: { id: BigInt(i.productId), tenantId }, select: { id: true } });
      if (!product) { res.status(403).json({ status: 403, detail: `Product ${i.productId} not found or not accessible` }); return; }
    }

    // Fetch customer record early for pricing tier, auto-apply, credit validation
    let customerRecord: any = null;
    let autoApplied = 0;
    let pricingTier: any = null;
    if (customerId) {
      customerRecord = await prisma.customer.findFirst({
        where: { id: customerId, tenantId },
        select: { customerCode: true, creditLimit: true, currentBalance: true, pricingTierId: true, pricingTier: true },
      });
      // Apply pricing tier discount to sale items (before computing subtotal)
      if (customerRecord && customerRecord.pricingTier && customerRecord.pricingTier.isActive) {
        pricingTier = customerRecord.pricingTier;
        const discPct = Number(pricingTier.discountPercent) / 100;
        for (const item of saleItems) {
          item.unitPrice = Number((item.unitPrice * (1 - discPct)).toFixed(2));
        }
      }
    }

    const saleSubtotal = saleItems.reduce((s: number, i: any) => s + (i.unitPrice * i.quantity), 0);
    const returnSubtotal = returnItems.reduce((s: number, i: any) => s + Math.abs(i.unitPrice * i.quantity), 0);
    const netTotal = saleSubtotal - (discount || 0) - returnSubtotal;
    let finalTotal = Math.max(0, netTotal);
    const customerCredit = netTotal < 0 ? Math.abs(netTotal) : 0;

    // Auto-apply existing credit balance (old PHP behavior)
    if (customerRecord && customerRecord.customerCode !== 'WALKIN' && Number(customerRecord.currentBalance) > 0 && finalTotal > 0) {
      autoApplied = Math.min(Number(customerRecord.currentBalance), finalTotal);
      finalTotal -= autoApplied;
    }

    // Separate credit vs cash payments
    let creditPortion = 0;
    let cashPortion = 0;
    for (const p of payments) {
      if (p.method === 'CREDIT') creditPortion += p.amount;
      else cashPortion += p.amount;
    }
    const paidAmount = cashPortion;
    const paymentStatus = customerCredit > 0 ? 'CREDIT_ISSUED'
      : (creditPortion > 0 && cashPortion === 0) ? 'UNPAID'
      : (creditPortion > 0 || cashPortion < finalTotal) ? 'PARTIAL'
      : cashPortion >= finalTotal ? 'PAID'
      : 'UNPAID';

    // Credit payment validation (using pre-auto-apply balance for available credit)
    if (creditPortion > 0) {
      if (!customerId) {
        res.status(400).json({ status: 400, detail: 'Select a customer to use credit' }); return;
      }
      if (!customerRecord) {
        res.status(400).json({ status: 400, detail: 'Customer not found' }); return;
      }
      if (customerRecord.customerCode === 'WALKIN') {
        res.status(400).json({ status: 400, detail: 'Walk-in customers cannot use credit' }); return;
      }
      const effectiveBalance = Number(customerRecord.currentBalance) - autoApplied;
      const availableCredit = Number(customerRecord.creditLimit) - Math.max(0, effectiveBalance);
      if (creditPortion > availableCredit) {
        // Check for manager override
        const override = (req as any).body?.managerOverride;
        if (override?.username && override?.password) {
          const mgr = await prisma.user.findFirst({
            where: { username: override.username, tenantId: ctx.tenantId, isActive: true, status: 'active' },
            include: { roleAssignments: { include: { role: { select: { name: true } } } } },
          });
          if (mgr) {
            const valid = await verifyPassword(override.password, mgr.passwordHash);
            if (valid) {
              const managerRoles = ['manager', 'admin', 'owner', 'administrator'];
              const userRoles = mgr.roleAssignments.map((ra: any) => ra.role.name.toLowerCase());
              const hasManagerRole = mgr.isSuperAdmin || userRoles.some((r: string) => managerRoles.includes(r));
              if (!hasManagerRole) {
                res.status(403).json({ status: 403, detail: 'User does not have manager privileges' }); return;
              }
              logger.info('Credit override approved', { customerId: customerId.toString(), creditPortion, managerId: mgr.id.toString(), managerUsername: mgr.username, tenantId: tenantId.toString() });
            } else {
              res.status(400).json({ status: 400, detail: 'Manager override: invalid password' }); return;
            }
          } else {
            res.status(400).json({ status: 400, detail: 'Manager override: user not found' }); return;
          }
        } else {
          res.status(400).json({ status: 400, detail: `Credit limit exceeded. Available: ${formatPkr(availableCredit)}, Requested: ${formatPkr(creditPortion)}` }); return;
        }
      }
    }

    // Atomic transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Validate stock availability only — no movements yet
      for (const item of items) {
        if (item.quantity > 0) {
          const stock = await tx.warehouseStock.findFirst({
            where: { tenantId, productId: item.productId, warehouseId },
          });
          if (!stock || stock.quantity < item.quantity) {
            throw new Error(`Insufficient stock for product ${item.productId}`);
          }
        }
      }

      // 2. Compute FIFO costs for all sale items
      const fifoCosts: Record<number, { unitCost: number; cogs: number; qty: number }> = {};
      for (const item of saleItems) {
        let remaining = item.quantity;
        let totalCost = 0;
        const batches = await tx.stockBatch.findMany({
          where: { tenantId, warehouseId, productId: item.productId, quantityRemaining: { gt: 0 } },
          orderBy: { receivedAt: 'asc' },
        });
        for (const b of batches) {
          const consume = Math.min(remaining, b.quantityRemaining);
          totalCost += consume * Number(b.unitCost);
          remaining -= consume;
          if (remaining <= 0) break;
        }
        if (remaining > 0) {
          const prod = await tx.product.findFirst({ where: { id: item.productId, tenantId } });
          const fallbackCost = prod ? Number(prod.costPrice) || item.unitPrice : item.unitPrice;
          totalCost += remaining * fallbackCost;
        }
        const unitCost = item.quantity > 0 ? totalCost / item.quantity : 0;
        fifoCosts[item.productId] = { unitCost, cogs: totalCost, qty: item.quantity };
      }

      // 3. Create sale record (gives us sale.id for referenceId)
      const sale = await tx.sale.create({
        data: {
          tenantId, saleNumber, saleDate: new Date(),
          subtotal: saleSubtotal, discountAmount: discount || 0, totalAmount: finalTotal,
          paidAmount, changeAmount: Math.max(0, paidAmount - finalTotal),
          status: 'COMPLETED', paymentStatus,
          customerId: customerId || null, notes: notes || null, createdBy: requireAuthUserId(req),
          ...(pricingTier ? { tierId: pricingTier.id, tierName: pricingTier.name, tierDiscount: Number(pricingTier.discountPercent) } : {}),
          ...(offlineId ? { offlineId } : {}),
          createdAt: new Date(),
          items: {
            create: items.map((i: any) => {
              const fc = i.quantity > 0 ? fifoCosts[i.productId] : null;
              const uCost = fc ? fc.unitCost : (i.unitCost || i.unitPrice);
              const cogs = fc ? fc.cogs : 0;
              const lineTotal = (i.unitPrice * i.quantity) - (i.discountAmount || 0);
              return {
                tenantId, productId: i.productId, quantity: i.quantity,
                unitPrice: i.unitPrice, unitCost: uCost,
                discountAmount: i.discountAmount || 0,
                lineTotal,
                cogsAmount: cogs,
                profitAmount: lineTotal - cogs,
              };
            }),
          },
          payments: {
            create: payments.map((p: any) => ({
              tenantId, paymentMethod: p.method, amount: p.amount,
              referenceNumber: p.referenceNumber || null, createdBy: requireAuthUserId(req),
            })),
          },
        },
        include: { items: true, payments: true },
      });

      // 4. Stock adjustments + movements — consume FIFO batches, create movements
      for (const item of items) {
        if (item.quantity > 0) {
          // Sale item — deduct stock and consume FIFO batches
          await tx.warehouseStock.update({
            where: { tenantId_warehouseId_productId: { tenantId, warehouseId, productId: item.productId } },
            data: { quantity: { decrement: item.quantity } },
          });
          // Consume from oldest batches first
          let remaining = item.quantity;
          const fifoBatches = await tx.stockBatch.findMany({
            where: { tenantId, warehouseId, productId: item.productId, quantityRemaining: { gt: 0 } },
            orderBy: { receivedAt: 'asc' },
          });
          for (const b of fifoBatches) {
            if (remaining <= 0) break;
            const consume = Math.min(remaining, b.quantityRemaining);
            await tx.stockBatch.update({
              where: { id: b.id },
              data: { quantityRemaining: { decrement: consume } },
            });
            remaining -= consume;
          }
          const fc = fifoCosts[item.productId];
          await tx.stockMovement.create({
            data: { tenantId, warehouseId, productId: item.productId, movementType: 'SALE_OUT', quantity: -item.quantity, unitCost: fc ? fc.unitCost : item.unitPrice, referenceType: 'sale', referenceId: sale.id, createdBy: requireAuthUserId(req) },
          });
        } else if (item.quantity < 0) {
          // Return item — restore stock at FIFO batch cost (unchanged)
          const qty = Math.abs(item.quantity);
          await tx.warehouseStock.upsert({
            where: { tenantId_warehouseId_productId: { tenantId, warehouseId, productId: item.productId } },
            create: { tenantId, warehouseId, productId: item.productId, quantity: qty, averageCost: item.unitCost || item.unitPrice || 0 },
            update: { quantity: { increment: qty } },
          });
          const batch = await tx.stockBatch.findFirst({
            where: { tenantId, warehouseId, productId: item.productId },
            orderBy: { receivedAt: 'desc' },
          });
          const restoreCost = batch ? Number(batch.unitCost) : (item.unitCost || item.unitPrice || 0);
          if (batch) {
            await tx.stockBatch.update({
              where: { id: batch.id },
              data: { quantityRemaining: { increment: qty } },
            });
          } else {
            await tx.stockBatch.create({
              data: { tenantId, warehouseId, productId: item.productId, batchNumber: `RET-${Date.now()}`, quantityReceived: qty, quantityRemaining: qty, unitCost: restoreCost, receivedAt: new Date() },
            });
          }
          await tx.stockMovement.create({
            data: { tenantId, warehouseId, productId: item.productId, movementType: 'SALE_RETURN', quantity: qty, unitCost: restoreCost, referenceType: 'sale', referenceId: sale.id, createdBy: requireAuthUserId(req) },
          });
        }
      }

      // 4. Customer credit — auto-apply, return credit, and credit payment
      const netBalanceChange = (customerCredit + creditPortion) - autoApplied;
      if (customerId) {
        const cust = await tx.customer.findFirst({ where: { id: customerId, tenantId }, select: { currentBalance: true, customerCode: true } });
        if (cust && cust.customerCode !== 'WALKIN') {
          const before = Number(cust?.currentBalance || 0);
          if (netBalanceChange !== 0) {
            await tx.customer.update({
              where: { id: customerId },
              data: { currentBalance: { increment: netBalanceChange } },
            });
          }
          const balanceAfter = before + netBalanceChange;
          let ledgerType = 'SALE';
          if (netBalanceChange < 0) ledgerType = 'ADJUSTMENT';
          const descParts: string[] = [];
          if (customerCredit > 0) descParts.push(`credit issued ${customerCredit}`);
          if (creditPortion > 0) descParts.push(`credit used ${creditPortion}`);
          if (autoApplied > 0) descParts.push(`auto-applied ${autoApplied}`);
          if (descParts.length === 0) descParts.push(`Sale ${saleNumber}`);
          await tx.customerLedger.create({
            data: {
              tenantId, customerId, type: ledgerType, amount: Math.abs(netBalanceChange) || saleSubtotal,
              balanceBefore: before, balanceAfter,
              referenceId: sale.id, referenceType: 'sale',
              notes: descParts.join(', '),
              createdBy: requireAuthUserId(req),
            },
          });
        }
      }

      // 5. Journal entries — created for every completed sale
      const [revenueAcct, cashAcct, bankAcct, arAcct, returnsAcct] = await Promise.all([
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.SALES_REVENUE } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.CASH_ON_HAND } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.BANK_ACCOUNT } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.SALES_RETURNS } } }),
      ]);
      if (!revenueAcct) throw new Error('Sales Revenue account (4000) not found');

      const lines: any[] = [];
      const netRevenue = saleSubtotal - (discount || 0);

      // Dr: Sales Returns (if return items exist)
      if (returnSubtotal > 0 && returnsAcct) {
        lines.push({ tenantId, accountId: returnsAcct.id, debitAmount: returnSubtotal, creditAmount: 0, description: 'Sales returns' });
      }

      // Cr: Sales Revenue
      if (netRevenue > 0) {
        lines.push({ tenantId, accountId: revenueAcct.id, debitAmount: 0, creditAmount: netRevenue, description: 'Sales revenue' });
      }

      // Dr: Cash / Bank / AR for each payment method
      if (finalTotal > 0) {
        for (const pmt of payments) {
          if (pmt.amount > 0) {
            if (pmt.method === 'CREDIT' && arAcct) {
              lines.push({ tenantId, accountId: arAcct.id, debitAmount: pmt.amount, creditAmount: 0, description: 'Credit sale' });
            } else {
              const isBank = ['BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA'].includes(pmt.method);
              const acct = isBank ? bankAcct : cashAcct;
              if (acct) {
                lines.push({ tenantId, accountId: acct.id, debitAmount: Math.min(pmt.amount, finalTotal), creditAmount: 0, description: `${pmt.method} payment` });
              }
            }
          }
        }
      }

      // Cr: Customer Credit (if return > sale)
      if (customerCredit > 0) {
        const apAcct = await tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE } } });
        if (apAcct) {
          lines.push({ tenantId, accountId: apAcct.id, debitAmount: 0, creditAmount: customerCredit, description: 'Customer credit issued' });
        }
      }

      // Dr: Auto-applied credit (reduces customer credit liability)
      if (autoApplied > 0) {
        const apAcct = await tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE } } });
        if (apAcct) {
          lines.push({ tenantId, accountId: apAcct.id, debitAmount: autoApplied, creditAmount: 0, description: 'Auto-applied credit' });
        }
      }

      // Dr: Unpaid balance goes to Accounts Receivable
      const totalDebitSoFar = lines.reduce((s: number, l: any) => s + Number(l.debitAmount), 0);
      const totalCreditSoFar = lines.reduce((s: number, l: any) => s + Number(l.creditAmount), 0);
      if (totalCreditSoFar > totalDebitSoFar && arAcct) {
        lines.push({ tenantId, accountId: arAcct.id, debitAmount: totalCreditSoFar - totalDebitSoFar, creditAmount: 0, description: 'Unpaid balance' });
      }

      if (lines.length > 0) {
        const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debitAmount), 0);
        const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.creditAmount), 0);
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          throw new Error(`Journal entry not balanced: Dr ${totalDebit} != Cr ${totalCredit}`);
        }
        await tx.journalEntry.create({
          data: {
            tenantId, entryNumber: `JE-${saleNumber.replace('SAL-', '')}`, entryDate: new Date(),
            description: returnItems.length > 0 ? `Sale+Return ${saleNumber}` : `Sale ${saleNumber}`,
            totalDebit, totalCredit,
            createdBy: requireAuthUserId(req),
            lines: { create: lines },
          },
        });
      }

      // 6. COGS journal entry — Dr COGS, Cr Inventory
      const totalCogs = sale.items.reduce((s: number, i: any) => s + Number(i.cogsAmount), 0);
      if (totalCogs > 0) {
        const [cogsAcct, invAcct] = await Promise.all([
          tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.COST_OF_GOODS_SOLD } } }),
          tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.INVENTORY } } }),
        ]);
        if (cogsAcct && invAcct) {
          await tx.journalEntry.create({
            data: {
              tenantId, entryNumber: `COGS-${saleNumber.replace('SAL-', '')}`, entryDate: new Date(),
              description: `COGS ${saleNumber}`,
              totalDebit: totalCogs, totalCredit: totalCogs,
              createdBy: requireAuthUserId(req),
              lines: {
                create: [
                  { tenantId, accountId: cogsAcct.id, debitAmount: totalCogs, creditAmount: 0, description: 'Cost of goods sold' },
                  { tenantId, accountId: invAcct.id, debitAmount: 0, creditAmount: totalCogs, description: 'Inventory reduction' },
                ],
              },
            },
          });
        }
      }

      return sale;
    });

    let updatedBalance = 0;
    if (customerId) {
      const cust = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { currentBalance: true } });
      if (cust) updatedBalance = Number(cust.currentBalance);
    }

    // Low stock notifications (fire-and-forget)
    try {
      const lowStockItems = await prisma.warehouseStock.findMany({ where: { tenantId, quantity: { lte: 10 }, product: { isActive: true } }, include: { product: { select: { name: true } } }, take: 5 });
      if (lowStockItems.length > 0) {
        const adminUsers = await prisma.user.findMany({ where: { tenantId, isActive: true, roleAssignments: { some: { role: { slug: { in: ['admin', 'manager'] } } } } }, select: { id: true } });
        for (const item of lowStockItems) {
          for (const u of adminUsers) {
            await createNotification({ tenantId, userId: u.id, title: 'Low Stock Alert', message: `${item.product?.name} has only ${item.quantity} units remaining`, type: 'warning', link: '/inventory/stock' });
          }
        }
      }
    } catch { /* silent */ }

    logger.info('Sale completed', { saleNumber, total: finalTotal, creditPortion, customerCredit, autoApplied, tenantId: tenantId.toString() });
    res.status(201).json({
      data: {
        saleId: result.id.toString(),
        saleNumber: result.saleNumber,
        total: Number(result.totalAmount),
        paid: Number(result.paidAmount),
        change: Number(result.changeAmount),
        items: saleItems.length,
        customerCredit,
        creditPortion,
        autoApplied,
        balance: updatedBalance,
        paymentStatus,
        message: customerCredit > 0
          ? `Sale completed with Rs. ${customerCredit} credit issued`
          : creditPortion > 0
            ? `Sale completed. Credit used: Rs. ${formatPkr(creditPortion)}. New balance: Rs. ${formatPkr(updatedBalance)}`
            : autoApplied > 0
              ? `Sale completed. Auto-applied Rs. ${formatPkr(autoApplied)} credit. New balance: Rs. ${formatPkr(updatedBalance)}`
              : 'Sale completed successfully',
      },
    });
  } catch (error: any) {
    logger.error('Checkout failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Checkout Failed', detail: error.message });
  }
});

// ---- Print & Drawer ----
router.post('/print-receipt/:saleId', rbacMiddleware('pos.sales.create'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const sale = await prisma.sale.findFirst({
      where: { id: BigInt(req.params.saleId), tenantId: ctx.tenantId },
      include: { customer: { select: { fullName: true } }, items: { include: { product: { select: { name: true } } } }, payments: true, createdByUser: { select: { fullName: true } }, tenant: { select: { settings: true } } },
    });
    if (!sale) { res.status(404).json({ status: 404, detail: 'Sale not found' }); return; }
    const result = await printerService.printReceipt(ctx.tenantId, sale);
    res.json({ data: result });
  } catch (error: any) { logger.warn('Print sale receipt failed', { error: error.message }); res.json({ data: { success: false, reason: error.message } }); }
});

router.post('/print-return-receipt/:returnId', rbacMiddleware('pos.sales.create'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const ret = await prisma.salesReturn.findFirst({
      where: { id: BigInt(req.params.returnId), tenantId: ctx.tenantId },
      include: { customer: { select: { fullName: true } }, sale: { select: { saleNumber: true } }, items: { include: { product: { select: { name: true } } } } },
    });
    if (!ret) { res.status(404).json({ status: 404, detail: 'Return not found' }); return; }
    const settings = await printerService.getSettings(ctx.tenantId);
    if (!settings.enabled) { res.json({ data: { success: false, reason: 'Printer not configured' } }); return; }
    // Build receipt data
    const receiptData = {
      returnNumber: ret.returnNumber, saleNumber: ret.sale?.saleNumber || '',
      customerName: ret.customer?.fullName || '', totalAmount: Number(ret.totalAmount),
      items: ret.items.map((i: any) => ({ productName: i.product?.name || 'Item', quantity: i.quantityReturned, unitPrice: Number(i.unitPrice), lineTotal: Number(i.unitPrice) * i.quantityReturned })),
      refundMethod: req.body.refundMethod || 'cash',
    };
    const receipt = {
      settings: { companyName: 'Business', address: '', phone: '' },
      header: '', footer: '',
    };
    const buf: number[] = [0x1B, 0x40];
    buf.push(...[0x1B, 0x61, 0x01, 0x1B, 0x45, 0x01, ...receiptData.returnNumber.split('').map((c) => c.charCodeAt(0)), 0x1B, 0x45, 0x00, 0x1B, 0x61, 0x00, 0x0A]);
    // Simple text fallback — actual ESC/POS building is in printReceipt
    const out = `RETURN RECEIPT\n==============\nReturn #: ${receiptData.returnNumber}\nSale: ${receiptData.saleNumber}\nCustomer: ${receiptData.customerName}\nItems: ${receiptData.items.length}\nTotal: ${receiptData.totalAmount}\nThank you!\n\n\n`;
    const result = await printerService.printReceipt(ctx.tenantId, { saleNumber: `RETURN-${receiptData.returnNumber}`, saleDate: new Date(), customer: { fullName: receiptData.customerName }, items: ret.items.map((i: any) => ({ product: { name: i.product?.name }, quantity: i.quantityReturned, unitPrice: i.unitPrice, lineTotal: Number(i.unitPrice) * i.quantityReturned, subtotal: Number(i.unitPrice) * i.quantityReturned })), payments: [], changeAmount: 0, totalAmount: Number(ret.totalAmount), createdByUser: null, discountAmount: 0, subtotal: Number(ret.totalAmount) });
    res.json({ data: result });
  } catch (error: any) { logger.warn('Print return receipt failed', { error: error.message }); res.json({ data: { success: false, reason: error.message } }); }
});

router.post('/open-drawer', rbacMiddleware('pos.sales.create'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const result = await printerService.openDrawer(ctx.tenantId);
    res.json({ data: result });
  } catch (error: any) { logger.warn('POS open drawer failed', { error: error.message }); res.json({ data: { success: false, reason: error.message } }); }
});

export default router;
