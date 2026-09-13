import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { customerService } from '../services/customer.service';
import { rbacMiddleware } from '../middleware/rbac';
import { validateMiddleware } from '../middleware/validate';
import { ACCOUNT_CODES } from '../constants/accounts';
import { parseIdParam } from '../utils/helpers';
import logger from '../utils/logger';

const createCustomerSchema = z.object({
  fullName: z.string().min(2).max(100),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  taxNumber: z.string().max(50).optional(),
  creditLimit: z.number().min(0).default(0),
  creditDays: z.number().int().min(0).max(365).default(0),
  customerGroup: z.enum(['Retail', 'Wholesale', 'Gold', 'Silver']).optional(),
  salespersonId: z.number().int().positive().optional(),
  pricingTierId: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
});

const updateCustomerSchema = createCustomerSchema.partial();

const recordPaymentSchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  paymentMethod: z.string().default('CASH'),
  referenceNumber: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
  paymentDate: z.string().optional(),
});

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

router.get('/stats', rbacMiddleware('customers.view'), async (_req: Request, res: Response) => {
  try {
    const stats = await customerService.getStats();
    res.json({ data: stats });
  } catch (error: any) {
    res.json({ data: { total: 0, active: 0, totalReceivable: 0, withBalance: 0 } });
  }
});

router.get('/', rbacMiddleware('customers.view'), async (req: Request, res: Response) => {
  try {
    const result = await customerService.list({
      search: req.query.search as string,
      page: req.query.page ? Number(req.query.page) : 1,
      perPage: req.query.perPage ? Number(req.query.perPage) : 20,
      isActive: req.query.isActive as string | undefined,
      customerGroup: req.query.customerGroup as string | undefined,
      overLimitOnly: req.query.overLimitOnly as string | undefined,
    });
    res.json({ data: result.items, meta: { total: result.total, page: result.page, perPage: result.perPage } });
  } catch (error: any) {
    logger.error('Customer list failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Error', detail: 'Failed to load customers' });
  }
});

router.get('/search', rbacMiddleware('customers.view'), async (req: Request, res: Response) => {
  try {
    const result = await customerService.list({ search: req.query.q as string, perPage: 20 });
    res.json({ data: result.items });
  } catch { res.json({ data: [] }); }
});

// ---- Export, Receipts & Reports (must be before /:id to avoid routing conflicts) ----
router.get('/export/csv', rbacMiddleware('customers.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const customers = await prisma.customer.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null },
      orderBy: { fullName: 'asc' },
      select: {
        customerCode: true, fullName: true, phone: true, email: true,
        address: true, city: true, taxNumber: true,
        customerGroup: true, creditDays: true,
        creditLimit: true, currentBalance: true,
        isActive: true, createdAt: true,
        pricingTier: { select: { name: true } },
      }
    });
    const headers = ['Code','Name','Phone','Email','Address','City','Tax Number','Group','Credit Days','Credit Limit','Current Balance','Price Tier','Status','Created At'];
    const rows = customers.map(c => [
      c.customerCode, c.fullName, c.phone || '', c.email || '', c.address || '', c.city || '',
      c.taxNumber || '', c.customerGroup || '', c.creditDays ?? 0,
      c.creditLimit ? Number(c.creditLimit) : 0, Number(c.currentBalance),
      c.pricingTier?.name || '', c.isActive ? 'Active' : 'Inactive',
      c.createdAt.toISOString().slice(0, 10),
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v).join(','))
      .join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="customers-${new Date().toISOString().slice(0,10)}.csv"`);
    return res.send(csv);
  } catch (error: any) {
    res.status(500).json({ status: 500, detail: 'Failed to export customers' });
  }
});

router.get('/:id/payments/:paymentId/receipt', rbacMiddleware('customers.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const customerId = BigInt(req.params.id);
    const paymentId = parseInt(req.params.paymentId);
    const [customer, payment, tenant] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: customerId, tenantId: ctx.tenantId, deletedAt: null },
        select: { fullName: true, customerCode: true, phone: true, address: true, currentBalance: true }
      }),
      prisma.customerPayment.findFirst({
        where: { id: paymentId, customerId },
        select: { id: true, amount: true, notes: true, createdAt: true, referenceNumber: true }
      }),
      prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { name: true, settings: true }
      }),
    ]);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });

    const ts = (tenant?.settings as any) || {};
    const settings = { company_name: tenant?.name || '', phone: ts.phone || '', address: ts.address || '' };

    // Get ledger entry for balance info
    const ledger = await prisma.customerLedger.findFirst({
      where: { customerId, type: 'PAYMENT', amount: payment.amount, createdAt: payment.createdAt },
      orderBy: { createdAt: 'desc' },
      select: { balanceBefore: true, balanceAfter: true }
    });

    return res.json({ success: true, data: {
      customer,
      payment: {
        id: payment.id.toString(),
        amount: payment.amount,
        notes: payment.notes,
        createdAt: payment.createdAt,
        referenceNumber: payment.referenceNumber,
        balanceBefore: ledger?.balanceBefore || 0,
        balanceAfter: ledger?.balanceAfter || 0,
      },
      settings,
    } });
  } catch (error: any) {
    res.status(500).json({ status: 500, detail: error.message });
  }
});

router.get('/reports/aging', rbacMiddleware('reports.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const today = new Date();
    const customers = await prisma.customer.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null, currentBalance: { gt: 0 } },
      select: {
        id: true, fullName: true, customerCode: true, phone: true,
        currentBalance: true, creditLimit: true, creditDays: true,
        customerGroup: true,
        ledger: {
          where: { type: { in: ['SALE', 'ADJUSTMENT', 'MIGRATION'] } },
          select: { amount: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const report = customers.map((c) => {
      const creditDays = c.creditDays || 0;
      const buckets = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days91plus: 0 };
      for (const entry of c.ledger) {
        const dueDate = new Date(entry.createdAt);
        dueDate.setDate(dueDate.getDate() + creditDays);
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
        const amount = Number(entry.amount);
        if (daysOverdue <= 0) buckets.current += amount;
        else if (daysOverdue <= 30) buckets.days1_30 += amount;
        else if (daysOverdue <= 60) buckets.days31_60 += amount;
        else if (daysOverdue <= 90) buckets.days61_90 += amount;
        else buckets.days91plus += amount;
      }
      return {
        id: c.id.toString(), customerCode: c.customerCode, fullName: c.fullName,
        phone: c.phone, customerGroup: c.customerGroup,
        currentBalance: Number(c.currentBalance),
        creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
        creditDays, buckets,
        isOverLimit: c.creditLimit ? Number(c.currentBalance) > Number(c.creditLimit) : false,
        totalOverdue: buckets.days1_30 + buckets.days31_60 + buckets.days61_90 + buckets.days91plus,
      };
    });
    const totals = report.reduce((acc, r) => ({
      current: acc.current + r.buckets.current, days1_30: acc.days1_30 + r.buckets.days1_30,
      days31_60: acc.days31_60 + r.buckets.days31_60, days61_90: acc.days61_90 + r.buckets.days61_90,
      days91plus: acc.days91plus + r.buckets.days91plus, total: acc.total + r.currentBalance,
    }), { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days91plus: 0, total: 0 });
    res.json({ data: { report, totals, generatedAt: today.toISOString() } });
  } catch { res.status(500).json({ status: 500 }); }
});

router.get('/:id/aging', rbacMiddleware('customers.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const customer = await prisma.customer.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, fullName: true, customerCode: true, phone: true, currentBalance: true, creditLimit: true, creditDays: true, customerGroup: true },
    });
    if (!customer) { res.status(404).json({ status: 404 }); return; }
    const today = new Date();
    const creditDays = customer.creditDays || 0;
    const debitEntries = await prisma.customerLedger.findMany({
      where: { tenantId: ctx.tenantId, customerId: customer.id, type: { in: ['SALE', 'ADJUSTMENT', 'MIGRATION'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, amount: true, createdAt: true, notes: true },
    });
    const entries = debitEntries.map((e) => {
      const dueDate = new Date(e.createdAt);
      dueDate.setDate(dueDate.getDate() + creditDays);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
      return { id: e.id.toString(), amount: Number(e.amount), date: e.createdAt.toISOString().slice(0, 10), dueDate: dueDate.toISOString().slice(0, 10), daysOverdue: Math.max(0, daysOverdue), isOverdue: daysOverdue > 0, notes: e.notes };
    });
    const buckets = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days91plus: 0 };
    for (const e of entries) {
      if (e.daysOverdue === 0) buckets.current += e.amount;
      else if (e.daysOverdue <= 30) buckets.days1_30 += e.amount;
      else if (e.daysOverdue <= 60) buckets.days31_60 += e.amount;
      else if (e.daysOverdue <= 90) buckets.days61_90 += e.amount;
      else buckets.days91plus += e.amount;
    }
    res.json({ data: { customer: { id: customer.id.toString(), fullName: customer.fullName, customerCode: customer.customerCode, phone: customer.phone, currentBalance: Number(customer.currentBalance), creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null, creditDays, customerGroup: customer.customerGroup }, entries, buckets, isOverLimit: customer.creditLimit ? Number(customer.currentBalance) > Number(customer.creditLimit) : false, totalOutstanding: Number(customer.currentBalance) } });
  } catch { res.status(500).json({ status: 500 }); }
});

router.get('/:id', rbacMiddleware('customers.view'), async (req: Request, res: Response) => {
  try {
    const customer = await customerService.getById(BigInt(req.params.id));
    if (!customer) { res.status(404).json({ status: 404, title: 'Not Found' }); return; }
    res.json({ data: customer });
  } catch (error: any) {
    res.status(500).json({ status: 500, title: 'Error', detail: 'Failed to load customer' });
  }
});

router.post('/', rbacMiddleware('customers.create'), validateMiddleware(createCustomerSchema), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    // Duplicate phone detection
    if (req.body.phone) {
      const existing = await prisma.customer.findFirst({ where: { tenantId: ctx.tenantId, phone: req.body.phone, deletedAt: null } });
      if (existing) { res.status(409).json({ status: 409, detail: `Phone number already registered to ${existing.customerCode} - ${existing.fullName}` }); return; }
    }
    const result = await customerService.create(req.body);
    res.status(201).json({ data: result });
  } catch (error: any) {
    res.status(500).json({ status: 500, title: 'Error', detail: error.message });
  }
});

router.put('/:id', rbacMiddleware('customers.update'), validateMiddleware(updateCustomerSchema), async (req: Request, res: Response) => {
  try {
    await customerService.update(BigInt(req.params.id), req.body);
    res.json({ data: { message: 'Customer updated' } });
  } catch (error: any) {
    res.status(500).json({ status: 500, title: 'Error', detail: error.message });
  }
});

router.delete('/:id', rbacMiddleware('customers.delete'), async (req: Request, res: Response) => {
  try {
    await customerService.delete(BigInt(req.params.id));
    res.json({ data: { message: 'Customer deleted' } });
  } catch (error: any) {
    res.status(500).json({ status: 500, title: 'Error', detail: error.message });
  }
});

router.get('/:id/stats', rbacMiddleware('customers.view'), async (req: Request, res: Response) => {
  try {
    const stats = await customerService.getDashboardStats(BigInt(req.params.id));
    if (!stats) { res.status(404).json({ status: 404 }); return; }
    res.json({ data: stats });
  } catch { res.status(500).json({ status: 500 }); }
});

router.get('/:id/ledger', rbacMiddleware('customers.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.status(401).json({ status: 401, detail: 'No tenant context' }); return; }
    const customerId = BigInt(req.params.id);
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.perPage) || 20;
    const skip = (page - 1) * perPage;
    const where: any = { tenantId: ctx.tenantId, customerId };
    if (req.query.type) where.type = String(req.query.type).toUpperCase();
    if (req.query.startDate) where.createdAt = { ...where.createdAt, gte: new Date(String(req.query.startDate)) };
    if (req.query.endDate) where.createdAt = { ...where.createdAt, lte: new Date(String(req.query.endDate) + 'T23:59:59.999Z') };
    const [items, total] = await Promise.all([
      prisma.customerLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip, take: perPage,
        select: { id: true, type: true, amount: true, balanceBefore: true, balanceAfter: true, referenceId: true, referenceType: true, notes: true, createdAt: true },
      }),
      prisma.customerLedger.count({ where }),
    ]);

    // Resolve real reference numbers for all items in one batch per type
    const saleIds = items.filter((e) => e.referenceType === 'sale' && e.referenceId).map((e) => e.referenceId!);
    const paymentIds = items.filter((e) => e.referenceType === 'payment' && e.referenceId).map((e) => e.referenceId!);
    const returnIds = items.filter((e) => e.referenceType === 'sales_return' && e.referenceId).map((e) => e.referenceId!);

    const [sales, payments, returns] = await Promise.all([
      saleIds.length > 0 ? prisma.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, saleNumber: true, paymentStatus: true } }) : [],
      paymentIds.length > 0 ? prisma.customerPayment.findMany({ where: { id: { in: paymentIds } }, select: { id: true } }) : [],
      returnIds.length > 0 ? prisma.salesReturn.findMany({ where: { id: { in: returnIds } }, select: { id: true, returnNumber: true } }) : [],
    ]);

    // Fetch payment methods for sales to determine Credit vs Cash
    const salePaymentMethods = saleIds.length > 0 ? await prisma.salePayment.groupBy({
      by: ['saleId'],
      where: { saleId: { in: saleIds } },
      _sum: { amount: true },
    }) : [];
    const creditSaleIds = new Set(
      salePaymentMethods.filter((sp) => sp._sum.amount && Number(sp._sum.amount) > 0)
        .map((sp) => sp.saleId.toString())
    );
    // Actually, we need to check if any payment was CREDIT
    const salePayments = saleIds.length > 0 ? await prisma.salePayment.findMany({
      where: { saleId: { in: saleIds } },
      select: { saleId: true, paymentMethod: true },
    }) : [];
    const saleHasCredit = new Set<string>();
    for (const sp of salePayments) {
      if (sp.paymentMethod === 'CREDIT') saleHasCredit.add(sp.saleId.toString());
    }

    const saleMap = new Map(sales.map((s) => [s.id.toString(), s.saleNumber]));
    const paymentMap = new Map(payments.map((p) => [p.id.toString(), `PAY-${p.id}`]));
    const returnMap = new Map(returns.map((r) => [r.id.toString(), r.returnNumber]));

    res.json({
      data: items.map((e) => {
        const refId = e.referenceId?.toString() || null;
        let referenceNumber: string | null = null;
        if (e.type === 'MIGRATION') referenceNumber = 'OPENING';
        else if (e.referenceType === 'sale' && refId) referenceNumber = saleMap.get(refId) || null;
        else if (e.referenceType === 'payment') referenceNumber = refId ? (paymentMap.get(refId) || null) : `PAY-${e.id}`;
        else if (e.referenceType === 'sales_return' && refId) referenceNumber = returnMap.get(refId) || null;
        else referenceNumber = refId;

        // Generate a human-readable description matching the PHP app
        let description = '';
        if (e.type === 'PAYMENT') description = 'Payment received';
        else if (e.type === 'MIGRATION') description = 'Opening balance from legacy system';
        else if (e.type === 'REFUND') description = referenceNumber ? `Sales Return - Refund for ${referenceNumber}` : 'Sales Return';
        else if (e.type === 'SALE' && refId) {
          description = saleHasCredit.has(refId) ? 'Credit sale' : 'Cash sale';
        } else if (e.type === 'SALE') description = 'Sale';
        else if (e.type === 'ADJUSTMENT') description = e.notes || 'Balance adjustment';
        else description = e.notes || e.type;

        return {
          id: e.id.toString(), type: e.type, amount: Number(e.amount),
          balanceBefore: Number(e.balanceBefore), balanceAfter: Number(e.balanceAfter),
          referenceId: refId, referenceType: e.referenceType,
          referenceNumber,
          description,
          createdAt: e.createdAt,
        };
      }),
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
    });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.post('/:id/payments', rbacMiddleware('customers.payments'), validateMiddleware(recordPaymentSchema), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.status(401).json({ status: 401, detail: 'No tenant context' }); return; }

    const customerId = BigInt(req.params.id);
    const { amount, paymentMethod, referenceNumber, notes } = req.body;

    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId } });
    if (!customer) { res.status(404).json({ status: 404, detail: 'Customer not found' }); return; }

    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Create payment record
      const payment = await tx.customerPayment.create({
        data: {
          tenantId: ctx.tenantId,
          customerId,
          paymentDate: new Date(),
          amount,
          paymentMethod: paymentMethod || 'CASH',
          referenceNumber: referenceNumber || null,
          notes: notes || null,
          createdBy: req.user ? BigInt(req.user.userId) : 1,
        },
      });

      // 2. Decrease current balance
      const before = Number(customer.currentBalance);
      const updated = await tx.customer.update({
        where: { id: customerId },
        data: { currentBalance: { decrement: amount } },
        select: { currentBalance: true },
      });
      const balanceAfter = Number(updated.currentBalance);

      // Ledger entry
      await tx.customerLedger.create({
        data: {
          tenantId: ctx.tenantId, customerId,
          type: 'PAYMENT', amount,
          balanceBefore: before, balanceAfter,
          referenceId: null, referenceType: 'payment',
          notes: notes || null,
          createdBy: req.user ? BigInt(req.user.userId) : 1,
        },
      });

      // 3. Journal entry: Dr Cash, Cr Accounts Receivable
      const [cashAcct, bankAcct, arAcct] = await Promise.all([
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.CASH_ON_HAND } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.BANK_ACCOUNT } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE } } }),
      ]);

      if (arAcct) {
        const lines: any[] = [];
        const isBank = ['BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA'].includes(paymentMethod || '');
        const assetAcct = isBank ? bankAcct : cashAcct;
        if (assetAcct) {
          lines.push({ tenantId: ctx.tenantId, accountId: assetAcct.id, debitAmount: amount, creditAmount: 0, description: `Customer payment ${paymentMethod || 'CASH'}` });
        }
        lines.push({ tenantId: ctx.tenantId, accountId: arAcct.id, debitAmount: 0, creditAmount: amount, description: `Customer payment` });
        const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debitAmount), 0);
        const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.creditAmount), 0);
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          throw new Error(`Journal entry not balanced: Dr ${totalDebit} != Cr ${totalCredit}`);
        }
        await tx.journalEntry.create({
          data: {
            tenantId: ctx.tenantId, entryNumber: `PAY-${Date.now()}`, entryDate: new Date(),
            description: `Payment from ${customer.fullName}`,
            totalDebit, totalCredit,
            createdBy: req.user ? BigInt(req.user.userId) : 1,
            lines: { create: lines },
          },
        });
      }

      return { id: payment.id.toString(), balanceAfter };
    });

    logger.info('Customer payment recorded', { customerId: customerId.toString(), amount, tenantId: ctx.tenantId.toString() });
    // Non-blocking email
    if (customer.email) {
      const { sendPaymentReceiptEmail } = await import('../services/email.service');
      sendPaymentReceiptEmail(customer.email, {
        customerName: customer.fullName,
        amount: Number(amount),
        reference: `PAY-${result.id}`,
        date: new Date().toISOString().slice(0, 10),
        balance: Number(customer.currentBalance) - Number(amount),
      }).catch(() => {});
    }
    res.status(201).json({ data: { message: 'Payment recorded', ...result } });
  } catch (error: any) {
    logger.error('Customer payment failed', { error: error.message });
    res.status(500).json({ status: 500, detail: error.message });
  }
});

// Customer activity log
router.get('/:id/activity', rbacMiddleware('customers.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const page = Number(req.query.page) || 1;
    const [items, total] = await Promise.all([
      prisma.customerActivityLog.findMany({
        where: { tenantId: ctx.tenantId, customerId: BigInt(req.params.id) },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * 20, take: 20,
      }),
      prisma.customerActivityLog.count({ where: { tenantId: ctx.tenantId, customerId: BigInt(req.params.id) } }),
    ]);
    res.json({ data: items.map((e) => ({ id: e.id.toString(), action: e.action, description: e.description, createdBy: e.createdBy?.toString(), createdAt: e.createdAt })), meta: { total, page } });
  } catch { res.json({ data: [] }); }
});

export default router;
