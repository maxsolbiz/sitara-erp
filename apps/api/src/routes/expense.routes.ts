import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import { ACCOUNT_CODES } from '../constants/accounts';
import { createNotification } from './notification.routes';
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

// ---- Expense Categories ----

router.get('/categories', rbacMiddleware('expenses.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const items = await prisma.expenseCategory.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { expenses: true } } },
    });
    res.json({ data: items.map((c) => ({ id: c.id.toString(), name: c.name, description: c.description, isActive: c.isActive, isRecurring: c.isRecurring, expenseCount: c._count.expenses })) });
  } catch { res.json({ data: [] }); }
});

router.post('/categories', rbacMiddleware('expenses.categories.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { name, description } = req.body;
    if (!name) { res.status(400).json({ status: 400, detail: 'Name is required' }); return; }
    const created = await prisma.expenseCategory.create({ data: { tenantId: ctx.tenantId, name, description: description || null } });
    res.status(201).json({ data: { id: created.id.toString(), name: created.name } });
  } catch (error: any) { logger.error('Expense category create failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.put('/categories/:id', rbacMiddleware('expenses.categories.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { name, description } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    await prisma.expenseCategory.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data });
    res.json({ data: { message: 'Category updated' } });
  } catch (error: any) { logger.error('Expense category update failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.delete('/categories/:id', rbacMiddleware('expenses.categories.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    await prisma.expenseCategory.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data: { isActive: false } });
    res.json({ data: { message: 'Category deactivated' } });
  } catch (error: any) { logger.error('Expense category delete failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

// ---- Expenses ----

router.get('/stats', rbacMiddleware('expenses.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: {} }); return; }
    const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const rows = await prisma.expense.findMany({
      where: { tenantId: ctx.tenantId, expenseDate: { gte: startOfMonth } },
      select: { amount: true, status: true },
    });
    const stats = { totalPending: 0, totalApproved: 0, totalPaid: 0 };
    for (const r of rows) {
      const a = Number(r.amount);
      if (r.status === 'PENDING') stats.totalPending += a;
      else if (r.status === 'APPROVED') stats.totalApproved += a;
      else if (r.status === 'PAID') stats.totalPaid += a;
    }
    res.json({ data: stats });
  } catch { res.json({ data: {} }); }
});

router.get('/', rbacMiddleware('expenses.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const items = await prisma.expense.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { category: { select: { name: true } } },
    });
    res.json({ data: items.map((e) => ({ id: e.id.toString(), expenseNumber: e.expenseNumber, categoryId: e.categoryId.toString(), categoryName: e.category?.name, amount: Number(e.amount), description: e.description, expenseDate: e.expenseDate, status: e.status, vendorName: e.vendorName, createdAt: e.createdAt })) });
  } catch { res.json({ data: [] }); }
});

router.post('/', rbacMiddleware('expenses.create'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { categoryId, amount, description, expenseDate, paymentMethod, referenceNumber, notes } = req.body;
    if (!categoryId || !amount || amount <= 0) { res.status(400).json({ status: 400, detail: 'Category and positive amount required' }); return; }
    // FK ownership: category must belong to this tenant.
    const category = await prisma.expenseCategory.findFirst({ where: { id: BigInt(categoryId), tenantId: ctx.tenantId }, select: { id: true } });
    if (!category) { res.status(403).json({ status: 403, detail: 'Expense category not found or not accessible' }); return; }
    const num = `EXP-${Date.now().toString(36).toUpperCase()}`;
    const created = await prisma.expense.create({
      data: {
        tenantId: ctx.tenantId, expenseNumber: num,
        categoryId: BigInt(categoryId), amount, description: description || '',
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
        createdBy: requireAuthUserId(req),
      },
    });
    // Notify managers and accountants
    try {
      const mgrs = await prisma.user.findMany({ where: { tenantId: ctx.tenantId, isActive: true, roleAssignments: { some: { role: { slug: { in: ['admin', 'manager', 'accountant'] } } } } }, select: { id: true } });
      for (const u of mgrs) await createNotification({ tenantId: ctx.tenantId, userId: u.id, title: 'New Expense', message: `PKR ${amount} for ${description || 'expense'} awaiting approval`, type: 'info', link: '/expenses' });
    } catch { /* silent */ }
    res.status(201).json({ data: { id: created.id.toString(), expenseNumber: created.expenseNumber } });
  } catch (error: any) { logger.error('Expense create failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.get('/export/csv', rbacMiddleware('expenses.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const expenses = await prisma.expense.findMany({
      where: { tenantId: ctx.tenantId, status: { notIn: ['CANCELLED'] } },
      orderBy: { expenseDate: 'desc' },
      include: { category: { select: { name: true } } },
    });
    const headers = ['Receipt No','Category','Amount','Date','Description','Payment Method'];
    const rows = expenses.map(e => [
      e.expenseNumber, e.category?.name || '', Number(e.amount),
      e.expenseDate.toISOString().slice(0, 10), e.description || '', e.vendorName || '',
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses-${new Date().toISOString().slice(0,10)}.csv"`);
    return res.send(csv);
  } catch { logger.error('Expense export failed'); res.status(500).json({ status: 500, detail: 'Failed to export expenses' }); }
});

router.put('/:id', rbacMiddleware('expenses.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { categoryId, amount, description, expenseDate } = req.body;
    const data: any = {};
    if (categoryId) {
      // FK ownership: category must belong to this tenant.
      const category = await prisma.expenseCategory.findFirst({ where: { id: BigInt(categoryId), tenantId: ctx.tenantId }, select: { id: true } });
      if (!category) { res.status(403).json({ status: 403, detail: 'Expense category not found or not accessible' }); return; }
      data.categoryId = BigInt(categoryId);
    }
    if (amount !== undefined) data.amount = amount;
    if (description !== undefined) data.description = description;
    if (expenseDate) data.expenseDate = new Date(expenseDate);
    await prisma.expense.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data });
    res.json({ data: { message: 'Expense updated' } });
  } catch (error: any) { logger.error('Expense update failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.delete('/:id', rbacMiddleware('expenses.delete'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    await prisma.expense.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data: { status: 'CANCELLED' } });
    res.json({ data: { message: 'Expense cancelled' } });
  } catch (error: any) { logger.error('Expense cancel failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.patch('/:id/approve', rbacMiddleware('expenses.approve'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    await prisma.expense.updateMany({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      data: { status: 'APPROVED', approvedBy: requireAuthUserId(req), approvedAt: new Date() },
    });
    res.json({ data: { message: 'Expense approved' } });
  } catch (error: any) { logger.error('Expense approve failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.patch('/:id/pay', rbacMiddleware('expenses.pay'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const expense = await prisma.expense.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, include: { category: { select: { name: true } } } });
    if (!expense) { res.status(404).json({ status: 404, detail: 'Expense not found' }); return; }
    await prisma.expense.updateMany({
      where: { id: expense.id, tenantId: ctx.tenantId },
      data: { status: 'PAID', paidBy: requireAuthUserId(req), paidAt: new Date() },
    });
    // Journal entry: Dr Expense (via category mapping), Cr Cash
    const [cashAcct] = await Promise.all([
      prisma.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.CASH_ON_HAND } } }),
    ]);
    // Find expense account — try category name match, fallback to generic
    let expenseAcct = await prisma.chartOfAccount.findFirst({
      where: { tenantId: ctx.tenantId, accountName: { contains: expense.category?.name || '', mode: 'insensitive' } },
    });
    if (!expenseAcct) {
      expenseAcct = await prisma.chartOfAccount.findFirst({ where: { tenantId: ctx.tenantId, accountType: 'EXPENSE' } });
    }
    if (expenseAcct && cashAcct) {
      const amount = Number(expense.amount);
      await prisma.journalEntry.create({
        data: {
          tenantId: ctx.tenantId, entryNumber: `PAY-${expense.expenseNumber}`, entryDate: new Date(),
          description: `Pay expense ${expense.expenseNumber}`,
          totalDebit: amount, totalCredit: amount,
          createdBy: requireAuthUserId(req),
          lines: {
            create: [
              { tenantId: ctx.tenantId, accountId: expenseAcct.id, debitAmount: amount, creditAmount: 0, description: expense.description || 'Expense' },
              { tenantId: ctx.tenantId, accountId: cashAcct.id, debitAmount: 0, creditAmount: amount, description: 'Cash payment' },
            ],
          },
        },
      });
    }
    logger.info('Expense paid', { expenseNumber: expense.expenseNumber, amount: Number(expense.amount), tenantId: ctx.tenantId.toString() });
    res.json({ data: { message: 'Expense paid' } });
  } catch (error: any) { logger.error('Expense pay failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

export default router;
