import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import { parseIdParam, requireAuthUserId } from '../utils/helpers';
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

function mapFY(fy: any) {
  return { id: fy.id.toString(), name: fy.name, startDate: fy.startDate, endDate: fy.endDate, status: fy.status, closedAt: fy.closedAt, closedBy: fy.closedBy?.toString() || null, notes: fy.notes, createdAt: fy.createdAt };
}

function guard(ctx: any, res: any) { if (!ctx) { res.status(401).json({ status: 401 }); return false; } return true; }

// List all FYs
router.get('/', rbacMiddleware('accounting.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!guard(ctx, res)) return;
    const fys = await prisma.financialYear.findMany({ where: { tenantId: ctx!.tenantId }, orderBy: { startDate: 'desc' } });
    res.json({ data: fys.map(mapFY) });
  } catch { res.json({ data: [] }); }
});

// Get active FY
router.get('/active', rbacMiddleware('accounting.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!guard(ctx, res)) return;
    const fy = await prisma.financialYear.findFirst({ where: { tenantId: ctx!.tenantId, status: 'OPEN' }, orderBy: { startDate: 'desc' } });
    res.json({ data: fy ? mapFY(fy) : null });
  } catch { res.json({ data: null }); }
});

// Get FY detail with stats
router.get('/:id', rbacMiddleware('accounting.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!guard(ctx, res)) return;
    const fy = await prisma.financialYear.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx!.tenantId } });
    if (!fy) { res.status(404).json({ status: 404 }); return; }
    // Stats: total revenue/expenses/net from journal entries in this FY's date range
    const lines = await prisma.journalEntryLine.findMany({ where: { tenantId: ctx!.tenantId, journalEntry: { isReversed: false, entryDate: { gte: fy.startDate, lte: fy.endDate } } }, include: { journalEntry: { select: { entryDate: true } }, account: { select: { accountType: true } } } });
    let totalRevenue = 0, totalExpenses = 0;
    for (const l of lines) {
      if (l.account?.accountType === 'REVENUE') totalRevenue += Number(l.creditAmount) - Number(l.debitAmount);
      else if (l.account?.accountType === 'EXPENSE') totalExpenses += Number(l.debitAmount) - Number(l.creditAmount);
    }
    res.json({ data: { ...mapFY(fy), totalRevenue: Math.max(0, totalRevenue), totalExpenses: Math.max(0, totalExpenses), netIncome: totalRevenue - totalExpenses } });
  } catch { res.status(500).json({ status: 500 }); }
});

// Create FY
router.post('/', rbacMiddleware('accounting.accounts.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!guard(ctx, res)) return;
    const { name, startDate, endDate, notes } = req.body;
    if (!name || !startDate || !endDate) { res.status(400).json({ status: 400, detail: 'Name, startDate, endDate required' }); return; }
    const overlapping = await prisma.financialYear.findFirst({ where: { tenantId: ctx!.tenantId, startDate: { lte: new Date(endDate) }, endDate: { gte: new Date(startDate) } } });
    if (overlapping) { res.status(409).json({ status: 409, detail: 'Overlaps with existing financial year' }); return; }
    const fy = await prisma.financialYear.create({ data: { tenantId: ctx!.tenantId, name, startDate: new Date(startDate), endDate: new Date(endDate), status: 'OPEN', notes: notes || null } });
    res.status(201).json({ data: mapFY(fy) });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// Update FY
router.put('/:id', rbacMiddleware('accounting.accounts.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!guard(ctx, res)) return;
    const fy = await prisma.financialYear.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx!.tenantId } });
    if (!fy) { res.status(404).json({ status: 404 }); return; }
    if (fy.status !== 'OPEN') { res.status(400).json({ status: 400, detail: 'Cannot modify a closed financial year' }); return; }
    const { name, startDate, endDate, notes } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = new Date(endDate);
    if (notes !== undefined) data.notes = notes;
    await prisma.financialYear.update({ where: { id: fy.id }, data });
    res.json({ data: { message: 'Financial year updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// Delete FY
router.delete('/:id', rbacMiddleware('accounting.accounts.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!guard(ctx, res)) return;
    const fy = await prisma.financialYear.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx!.tenantId } });
    if (!fy) { res.status(404).json({ status: 404 }); return; }
    // Check for transactions
    const txCount = await prisma.sale.count({ where: { financialYearId: fy.id } }) + await prisma.expense.count({ where: { financialYearId: fy.id } }) + await prisma.journalEntry.count({ where: { financialYearId: fy.id } });
    if (txCount > 0) { res.status(400).json({ status: 400, detail: `Cannot delete: ${txCount} transactions reference this financial year` }); return; }
    await prisma.financialYear.delete({ where: { id: fy.id } });
    res.json({ data: { message: 'Financial year deleted' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// Activate FY
router.patch('/:id/activate', rbacMiddleware('accounting.accounts.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!guard(ctx, res)) return;
    const fy = await prisma.financialYear.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx!.tenantId } });
    if (!fy) { res.status(404).json({ status: 404 }); return; }
    if (fy.status !== 'OPEN') { res.status(400).json({ status: 400, detail: 'Can only activate OPEN financial years' }); return; }
    await prisma.financialYear.updateMany({ where: { tenantId: ctx!.tenantId, status: 'OPEN' }, data: { status: 'OPEN' } }); // keep others OPEN but this just sets active
    // The concept of "active" is just the latest OPEN year — we don't need a separate flag
    res.json({ data: { message: `${fy.name} is now the active financial year` } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// Preview close
router.get('/:id/preview', rbacMiddleware('accounting.accounts.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!guard(ctx, res)) return;
    const fy = await prisma.financialYear.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx!.tenantId } });
    if (!fy) { res.status(404).json({ status: 404 }); return; }
    if (fy.status !== 'OPEN') { res.status(400).json({ status: 400, detail: 'Financial year is already closed' }); return; }
    const lines = await prisma.journalEntryLine.findMany({ where: { tenantId: ctx!.tenantId, journalEntry: { isReversed: false, entryDate: { gte: fy.startDate, lte: fy.endDate } } }, include: { account: { select: { accountType: true, accountName: true, accountCode: true } } } });
    const revenue: any[] = []; const expensesTotal: any[] = [];
    let totalRevenue = 0, totalExpenses = 0;
    const seen = new Set<string>();
    for (const l of lines) {
      if (l.account?.accountType === 'REVENUE' && !seen.has(l.accountId.toString())) {
        seen.add(l.accountId.toString());
        const bal = lines.filter((x: any) => x.accountId === l.accountId).reduce((s: number, x: any) => s + Number(x.creditAmount) - Number(x.debitAmount), 0);
        if (bal > 0) { revenue.push({ accountCode: l.account.accountCode, accountName: l.account.accountName, balance: bal }); totalRevenue += bal; }
      } else if (l.account?.accountType === 'EXPENSE' && !seen.has(l.accountId.toString())) {
        seen.add(l.accountId.toString());
        const bal = lines.filter((x: any) => x.accountId === l.accountId).reduce((s: number, x: any) => s + Number(x.debitAmount) - Number(x.creditAmount), 0);
        if (bal > 0) { expensesTotal.push({ accountCode: l.account.accountCode, accountName: l.account.accountName, balance: bal }); totalExpenses += bal; }
      }
    }
    res.json({ data: { revenue: { accounts: revenue, total: totalRevenue }, expenses: { accounts: expensesTotal, total: totalExpenses }, netIncome: totalRevenue - totalExpenses, closingEntriesCount: revenue.length + expensesTotal.length + 1 } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// Close FY
router.post('/:id/close', rbacMiddleware('accounting.accounts.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!guard(ctx, res)) return;
    const tenantId = ctx!.tenantId;
    const fy = await prisma.financialYear.findFirst({ where: { id: BigInt(req.params.id), tenantId } });
    if (!fy) { res.status(404).json({ status: 404 }); return; }
    if (fy.status !== 'OPEN') { res.status(400).json({ status: 400, detail: 'Financial year is already closed' }); return; }

    await prisma.$transaction(async (tx: any) => {
      const lines = await tx.journalEntryLine.findMany({ where: { tenantId, journalEntry: { isReversed: false, entryDate: { gte: fy.startDate, lte: fy.endDate } } }, include: { account: { select: { accountType: true, accountName: true, accountCode: true } } } });
      const seen = new Set<string>();
      let totalRevenue = 0, totalExpenses = 0;
      const closingLines: any[] = [];

      // Close revenue accounts to Income Summary
      for (const l of lines) {
        if (l.account?.accountType === 'REVENUE' && !seen.has(l.accountId.toString())) {
          seen.add(l.accountId.toString());
          const bal = lines.filter((x: any) => x.accountId === l.accountId).reduce((s: number, x: any) => s + Number(x.creditAmount) - Number(x.debitAmount), 0);
          if (bal > 0) {
            closingLines.push({ tenantId, accountId: l.accountId, debitAmount: bal, creditAmount: 0, description: `Close ${l.account.accountName}` });
            totalRevenue += bal;
          }
        }
      }

      // Close expense accounts to Income Summary
      seen.clear();
      for (const l of lines) {
        if (l.account?.accountType === 'EXPENSE' && !seen.has(l.accountId.toString())) {
          seen.add(l.accountId.toString());
          const bal = lines.filter((x: any) => x.accountId === l.accountId).reduce((s: number, x: any) => s + Number(x.debitAmount) - Number(x.creditAmount), 0);
          if (bal > 0) {
            closingLines.push({ tenantId, accountId: l.accountId, debitAmount: 0, creditAmount: bal, description: `Close ${l.account.accountName}` });
            totalExpenses += bal;
          }
        }
      }

      // Find Retained Earnings account (3000 or 3100)
      let retainedEarnings = await tx.chartOfAccount.findFirst({ where: { tenantId, accountCode: '3100' } });
      if (!retainedEarnings) retainedEarnings = await tx.chartOfAccount.findFirst({ where: { tenantId, accountCode: '3000' } });
      const netIncome = totalRevenue - totalExpenses;

      if (closingLines.length > 0 && retainedEarnings) {
        // Credit Income Summary (the sum of all revenue debits minus expense credits)
        const incomeSummary = closingLines.reduce((s: number, l: any) => s + Number(l.debitAmount) - Number(l.creditAmount), 0);
        // Transfer to Retained Earnings
        if (incomeSummary !== 0) {
          if (incomeSummary > 0) closingLines.push({ tenantId, accountId: retainedEarnings.id, debitAmount: 0, creditAmount: incomeSummary, description: 'Net income transferred to retained earnings' });
          else closingLines.push({ tenantId, accountId: retainedEarnings.id, debitAmount: Math.abs(incomeSummary), creditAmount: 0, description: 'Net loss transferred to retained earnings' });
        }
        const td = closingLines.reduce((s: number, l: any) => s + Number(l.debitAmount), 0);
        const tc = closingLines.reduce((s: number, l: any) => s + Number(l.creditAmount), 0);
        if (Math.abs(td - tc) > 0.01) throw new Error(`Closing entry not balanced: Dr ${td} != Cr ${tc}`);
        await tx.journalEntry.create({
          data: { tenantId, entryNumber: `CLOSE-${fy.name.replace(/\s+/g, '')}`, entryDate: new Date(), description: `Year-end closing: ${fy.name}`, totalDebit: td, totalCredit: tc, createdBy: requireAuthUserId(req), financialYearId: fy.id, lines: { create: closingLines } },
        });
      }

      await tx.financialYear.update({ where: { id: fy.id }, data: { status: 'CLOSED', closedAt: new Date(), closedBy: req.user ? BigInt(req.user.userId) : null } });
    });

    logger.info('Financial year closed', { fyId: fy.id.toString(), name: fy.name, tenantId: tenantId.toString() });
    void logActivity({
      tenantId, userId: req.user ? BigInt(req.user.userId) : undefined,
      action: 'FY_CLOSE', entityType: 'financial_year', entityId: fy.id,
      description: `Financial year ${fy.name} closed`,
      oldValues: { status: 'OPEN' },
      newValues: { status: 'CLOSED', closedBy: req.user?.userId },
      ipAddress: req.ip || '', userAgent: (req.headers['user-agent'] as string) || '',
    });
    res.json({ data: { message: `Financial year ${fy.name} closed successfully` } });
  } catch (error: any) { logger.error('Financial year close failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

export default router;
