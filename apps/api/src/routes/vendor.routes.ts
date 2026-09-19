import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { vendorService } from '../services/vendor.service';
import { rbacMiddleware } from '../middleware/rbac';
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

router.get('/stats', rbacMiddleware('vendors.view'), async (_req: Request, res: Response) => {
  try { const s = await vendorService.getStats(); res.json({ data: s }); }
  catch (error: any) { logger.warn('Vendor stats failed', { error: error.message }); res.json({ data: { total: 0, active: 0, totalPayable: 0, withBalance: 0 } }); }
});

router.get('/', rbacMiddleware('vendors.view'), async (req: Request, res: Response) => {
  try {
    const r = await vendorService.list({ search: req.query.search as string, page: req.query.page ? Number(req.query.page) : 1 });
    res.json({ data: r.items, meta: { total: r.total, page: r.page } });
  } catch (e: any) { logger.error('Vendor list failed', { error: e.message }); res.status(500).json({ status: 500, title: 'Error' }); }
});

router.get('/search', rbacMiddleware('vendors.view'), async (req: Request, res: Response) => {
  try { const r = await vendorService.list({ search: req.query.q as string, perPage: 20 }); res.json({ data: r.items }); }
  catch (error: any) { logger.warn('Vendor search failed', { error: error.message }); res.json({ data: [] }); }
});

router.get('/export/csv', rbacMiddleware('vendors.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const vendors = await prisma.vendor.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null },
      orderBy: { companyName: 'asc' },
      select: { code: true, companyName: true, contactPerson: true, phone: true, email: true, address: true, taxNumber: true, creditLimit: true, currentBalance: true, isActive: true, createdAt: true },
    });
    const headers = ['Code','Company Name','Contact Person','Phone','Email','Address','Tax Number','Credit Limit','Current Balance','Status','Created At'];
    const rows = vendors.map(v => [
      v.code, v.companyName, v.contactPerson || '', v.phone || '', v.email || '',
      v.address || '', v.taxNumber || '', Number(v.creditLimit), Number(v.currentBalance),
      v.isActive ? 'Active' : 'Inactive', v.createdAt.toISOString().slice(0, 10),
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="vendors-${new Date().toISOString().slice(0,10)}.csv"`);
    return res.send(csv);
  } catch { logger.error('Vendor export failed'); res.status(500).json({ status: 500, detail: 'Failed to export vendors' }); }
});

router.get('/:id', rbacMiddleware('vendors.view'), async (req: Request, res: Response) => {
    try { const v = await vendorService.getById(BigInt(req.params.id)); if (!v) { res.status(404).json({ status: 404 }); return; } res.json({ data: v }); }
    catch { logger.error('Vendor detail failed'); res.status(500).json({ status: 500 }); }
});

router.post('/', rbacMiddleware('vendors.create'), async (req: Request, res: Response) => {
    try { const r = await vendorService.create(req.body); res.status(201).json({ data: r }); }
    catch (e: any) { logger.error('Vendor create failed', { error: e.message }); res.status(500).json({ status: 500, detail: e.message }); }
});

router.put('/:id', rbacMiddleware('vendors.update'), async (req: Request, res: Response) => {
    try { await vendorService.update(BigInt(req.params.id), req.body); res.json({ data: { message: 'Updated' } }); }
    catch (e: any) { logger.error('Vendor update failed', { error: e.message }); res.status(500).json({ status: 500, detail: e.message }); }
});

router.delete('/:id', rbacMiddleware('vendors.delete'), async (req: Request, res: Response) => {
    try { await vendorService.delete(BigInt(req.params.id)); res.json({ data: { message: 'Deleted' } }); }
    catch (e: any) { logger.error('Vendor delete failed', { error: e.message }); res.status(500).json({ status: 500, detail: e.message }); }
});

// ---- Vendor Payments ----
router.get('/:id/payments', rbacMiddleware('vendors.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const page = Number(req.query.page) || 1;
    const [items, total] = await Promise.all([
      prisma.vendorPayment.findMany({
        where: { tenantId: ctx.tenantId, vendorId: BigInt(req.params.id) },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * 20, take: 20,
      }),
      prisma.vendorPayment.count({ where: { tenantId: ctx.tenantId, vendorId: BigInt(req.params.id) } }),
    ]);
    res.json({ data: items.map((p) => ({ id: p.id.toString(), paymentDate: p.paymentDate, amount: Number(p.amount), paymentMethod: p.paymentMethod, referenceNumber: p.referenceNumber, notes: p.notes, createdAt: p.createdAt })), meta: { total, page } });
  } catch (error: any) { logger.warn('Vendor payments failed', { error: error.message }); res.json({ data: [] }); }
});

router.post('/:id/payments', rbacMiddleware('vendors.payments'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const vendorId = BigInt(req.params.id);
    const { amount, paymentMethod, paymentDate, referenceNumber, notes } = req.body;
    if (!amount || amount <= 0) { res.status(400).json({ status: 400, detail: 'Amount must be positive' }); return; }

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId: ctx.tenantId } });
    if (!vendor) { res.status(404).json({ status: 404, detail: 'Vendor not found' }); return; }

    const result = await prisma.$transaction(async (tx: any) => {
      const payment = await tx.vendorPayment.create({
        data: { tenantId: ctx.tenantId, vendorId, paymentDate: paymentDate ? new Date(paymentDate) : new Date(), amount, paymentMethod: paymentMethod || 'CASH', referenceNumber: referenceNumber || null, notes: notes || null, createdBy: requireAuthUserId(req) },
      });

      const before = Number(vendor.currentBalance);
      const balanceAfter = before - amount;
      await tx.vendor.update({ where: { id: vendorId }, data: { currentBalance: { decrement: amount } } });
      await tx.vendorLedger.create({
        data: { tenantId: ctx.tenantId, vendorId, type: 'PAYMENT', amount, balanceBefore: before, balanceAfter, referenceId: payment.id, referenceType: 'vendor_payment', notes: notes || null, createdBy: requireAuthUserId(req) },
      });

      // Journal entry: Dr AP, Cr Cash
      const [apAcct, cashAcct, bankAcct] = await Promise.all([
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.CASH_ON_HAND } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.BANK_ACCOUNT } } }),
      ]);
      if (apAcct) {
        const isBank = ['BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA'].includes(paymentMethod || '');
        const assetAcct = isBank ? bankAcct : cashAcct;
        if (assetAcct) {
          await tx.journalEntry.create({
            data: {
              tenantId: ctx.tenantId, entryNumber: `PAY-${Date.now()}`, entryDate: new Date(),
              description: `Payment to ${vendor.companyName}`,
              totalDebit: amount, totalCredit: amount,
              createdBy: requireAuthUserId(req),
              lines: { create: [{ tenantId: ctx.tenantId, accountId: apAcct.id, debitAmount: amount, creditAmount: 0, description: 'Vendor payment' }, { tenantId: ctx.tenantId, accountId: assetAcct.id, debitAmount: 0, creditAmount: amount, description: paymentMethod || 'CASH' }] },
            },
          });
        }
      }

      return { id: payment.id.toString(), balanceAfter };
    });

    logger.info('Vendor payment recorded', { vendorId: vendorId.toString(), amount, tenantId: ctx.tenantId.toString() });
    res.status(201).json({ data: { message: 'Payment recorded', ...result } });
  } catch (error: any) { logger.error('Vendor payment failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

// ---- Vendor Ledger ----
router.get('/:id/ledger', rbacMiddleware('vendors.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const page = Number(req.query.page) || 1;
    const [items, total] = await Promise.all([
      prisma.vendorLedger.findMany({
        where: { tenantId: ctx.tenantId, vendorId: BigInt(req.params.id) },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * 20, take: 20,
      }),
      prisma.vendorLedger.count({ where: { tenantId: ctx.tenantId, vendorId: BigInt(req.params.id) } }),
    ]);
    res.json({ data: items.map((e) => ({ id: e.id.toString(), type: e.type, amount: Number(e.amount), balanceBefore: Number(e.balanceBefore), balanceAfter: Number(e.balanceAfter), referenceId: e.referenceId?.toString() || null, referenceType: e.referenceType, notes: e.notes, createdAt: e.createdAt })), meta: { total, page } });
  } catch (error: any) { logger.warn('Vendor ledger list failed', { error: error.message }); res.json({ data: [] }); }
});

// ---- Vendor Statement ----
router.get('/:id/statement', rbacMiddleware('vendors.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const vendorId = BigInt(req.params.id);
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId: ctx.tenantId } });
    if (!vendor) { res.status(404).json({ status: 404 }); return; }
    const entries = await prisma.vendorLedger.findMany({
      where: { tenantId: ctx.tenantId, vendorId },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    res.json({ data: { vendorName: vendor.companyName, currentBalance: Number(vendor.currentBalance), entries: entries.map((e) => ({ id: e.id.toString(), type: e.type, amount: Number(e.amount), balanceBefore: Number(e.balanceBefore), balanceAfter: Number(e.balanceAfter), referenceId: e.referenceId?.toString() || null, referenceType: e.referenceType, notes: e.notes, createdAt: e.createdAt })) } });
  } catch { logger.error('Vendor ledger failed'); res.status(500).json({ status: 500 }); }
});

// Vendor activity log
router.get('/:id/activity', rbacMiddleware('vendors.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const page = Number(req.query.page) || 1;
    const [items, total] = await Promise.all([
      prisma.vendorActivityLog.findMany({
        where: { tenantId: ctx.tenantId, vendorId: BigInt(req.params.id) },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * 20, take: 20,
      }),
      prisma.vendorActivityLog.count({ where: { tenantId: ctx.tenantId, vendorId: BigInt(req.params.id) } }),
    ]);
    res.json({ data: items.map((e) => ({ id: e.id.toString(), action: e.action, description: e.description, createdBy: e.createdBy?.toString(), createdAt: e.createdAt })), meta: { total, page } });
  } catch (error: any) { logger.warn('Vendor activity failed', { error: error.message }); res.json({ data: [] }); }
});

export default router;
