import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { accountingService } from '../services/accounting.service';
import { rbacMiddleware } from '../middleware/rbac';
import { parseIdParam, requireAuthUserId } from '../utils/helpers';
import { logActivity } from '../utils/activity';
import logger from '../utils/logger';

const router = Router();

// Reject malformed numeric IDs with 400 instead of 500/P2025 downstream
// (BigInt('') silently coerces to 0n; BigInt('abc') throws).
for (const name of ['id', 'accountId']) {
  router.param(name, (req, res, next, val) => {
    if (parseIdParam(val) === null) {
      res.status(400).json({ status: 400, title: 'Bad Request', detail: 'Invalid id parameter' });
      return;
    }
    next();
  });
}

router.get('/', rbacMiddleware('accounting.view'), async (_req: Request, res: Response) => {
  try {
    const [accounts, entries] = await Promise.all([
      accountingService.getChartOfAccounts(),
      accountingService.getJournalEntries(1, 10),
    ]);
    res.json({ data: { accountsCount: accounts.length, entriesCount: entries.total, recentEntries: entries.items } });
  } catch { res.json({ data: { accountsCount: 0, entriesCount: 0, recentEntries: [] } }); }
});

router.get('/chart-of-accounts', rbacMiddleware('accounting.view'), async (_req: Request, res: Response) => {
  try { const accounts = await accountingService.getChartOfAccounts(); res.json({ data: accounts }); }
  catch { res.json({ data: [] }); }
});

router.post('/chart-of-accounts', rbacMiddleware('accounting.accounts.manage'), async (req: Request, res: Response) => {
  try { const r = await accountingService.createAccount(req.body); res.status(201).json({ data: r }); }
  catch (e: any) { logger.error('Account create failed', { error: e.message }); res.status(500).json({ status: 500, detail: e.message }); }
});

router.get('/journal-entries', rbacMiddleware('accounting.view'), async (req: Request, res: Response) => {
  try { const r = await accountingService.getJournalEntries(req.query.page ? Number(req.query.page) : 1); res.json({ data: r.items, meta: { total: r.total } }); }
  catch { res.json({ data: [] }); }
});

router.post('/journal-entries', rbacMiddleware('accounting.journals.create'), async (req: Request, res: Response) => {
  try {
    const r = await accountingService.createJournalEntry(req.body, {
      userId: req.user ? BigInt(req.user.userId) : undefined,
      ipAddress: req.ip || '', userAgent: (req.headers['user-agent'] as string) || '',
    });
    res.status(201).json({ data: r });
  }
  catch (e: any) {
    const msg = e.message || '';
    if (msg.includes('must equal credits') || msg.includes('Debits') || msg.includes('balanced')) {
      res.status(400).json({ status: 400, detail: msg });
    } else {
      logger.error('JE create failed', { error: msg });
      res.status(500).json({ status: 500, detail: msg });
    }
  }
});

router.get('/trial-balance', rbacMiddleware('accounting.reports'), async (req: Request, res: Response) => {
  try { const fyId = req.query.financialYearId ? BigInt(req.query.financialYearId as string) : undefined; const r = await accountingService.getTrialBalance(fyId); res.json({ data: r }); }
  catch (e: any) { logger.error('Trial balance failed', { error: e.message }); res.status(500).json({ status: 500, detail: e.message }); }
});

router.get('/profit-loss', rbacMiddleware('accounting.reports'), async (req: Request, res: Response) => {
  try { const fyId = req.query.financialYearId ? BigInt(req.query.financialYearId as string) : undefined; const r = await accountingService.getProfitLoss(fyId); res.json({ data: r }); }
  catch (e: any) { logger.error('Profit-loss failed', { error: e.message }); res.status(500).json({ status: 500, detail: e.message }); }
});

router.get('/balance-sheet', rbacMiddleware('accounting.reports'), async (req: Request, res: Response) => {
  try { const fyId = req.query.financialYearId ? BigInt(req.query.financialYearId as string) : undefined; const r = await accountingService.getBalanceSheet(fyId); res.json({ data: r }); }
  catch (e: any) { logger.error('Balance sheet failed', { error: e.message }); res.status(500).json({ status: 500, detail: e.message }); }
});

// ---- General Ledger ----
router.get('/general-ledger', rbacMiddleware('accounting.reports'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const accounts = await prisma.chartOfAccount.findMany({ where: { tenantId: ctx.tenantId, isActive: true }, orderBy: { accountCode: 'asc' } });
    const lines = await prisma.journalEntryLine.findMany({ where: { tenantId: ctx.tenantId, journalEntry: { isReversed: false } } });
    const result = accounts.map((a) => {
      const aLines = lines.filter((l) => l.accountId === a.id);
      const totalDebits = aLines.reduce((s, l) => s + Number(l.debitAmount), 0);
      const totalCredits = aLines.reduce((s, l) => s + Number(l.creditAmount), 0);
      const openingBalance = Number(a.openingBalance);
      const closingBalance = ['ASSET', 'EXPENSE'].includes(a.accountType) ? openingBalance + totalDebits - totalCredits : openingBalance + totalCredits - totalDebits;
      return { accountId: a.id.toString(), accountCode: a.accountCode, accountName: a.accountName, accountType: a.accountType, openingBalance, totalDebits, totalCredits, closingBalance };
    });
    res.json({ data: { asOfDate: new Date().toISOString().slice(0, 10), accounts: result } });
  } catch { logger.error('General ledger failed'); res.status(500).json({ status: 500 }); }
});

router.get('/general-ledger/:accountId', rbacMiddleware('accounting.reports'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const account = await prisma.chartOfAccount.findFirst({ where: { id: BigInt(req.params.accountId), tenantId: ctx.tenantId } });
    if (!account) { res.status(404).json({ status: 404 }); return; }
    const entries = await prisma.journalEntry.findMany({
      where: { tenantId: ctx.tenantId, isReversed: false, lines: { some: { accountId: account.id } } },
      orderBy: { entryDate: 'asc' },
      include: { lines: { where: { accountId: account.id } } },
    });
    let runningBalance = Number(account.openingBalance);
    const isAssetExpense = ['ASSET', 'EXPENSE'].includes(account.accountType);
    const transactions = entries.map((e) => {
      const debit = e.lines.reduce((s, l) => s + Number(l.debitAmount), 0);
      const credit = e.lines.reduce((s, l) => s + Number(l.creditAmount), 0);
      runningBalance += isAssetExpense ? debit - credit : credit - debit;
      return { date: e.entryDate, entryNumber: e.entryNumber, description: e.description, debit, credit, balance: runningBalance };
    });
    const totalDebits = transactions.reduce((s, t) => s + t.debit, 0);
    const totalCredits = transactions.reduce((s, t) => s + t.credit, 0);
    res.json({ data: { account: { code: account.accountCode, name: account.accountName, type: account.accountType }, openingBalance: Number(account.openingBalance), transactions, closingBalance: runningBalance, totalDebits, totalCredits } });
  } catch { logger.error('General ledger account failed'); res.status(500).json({ status: 500 }); }
});

// ---- Journal Entry Reverse ----
router.post('/journal-entries/:id/reverse', rbacMiddleware('accounting.journals.reverse'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const entryId = BigInt(req.params.id);
    const { reason } = req.body;
    if (!reason) { res.status(400).json({ status: 400, detail: 'Reason is required' }); return; }

    const entry = await prisma.journalEntry.findFirst({ where: { id: entryId, tenantId: ctx.tenantId }, include: { lines: true } });
    if (!entry) { res.status(404).json({ status: 404, detail: 'Journal entry not found' }); return; }
    if (entry.isReversed) { res.status(400).json({ status: 400, detail: 'Journal entry is already reversed' }); return; }
    if (entry.reversedEntryId) { res.status(400).json({ status: 400, detail: 'Cannot reverse a reversing entry' }); return; }

    const result = await prisma.$transaction(async (tx: any) => {
      const rev = await tx.journalEntry.create({
        data: {
          tenantId: ctx.tenantId, entryNumber: `REV-${entry.entryNumber}`, entryDate: new Date(),
          description: `Reversal of: ${entry.description} — Reason: ${reason}`,
          totalDebit: entry.totalDebit, totalCredit: entry.totalCredit,
          referenceType: 'REVERSAL', referenceId: entry.id,
          createdBy: requireAuthUserId(req),
          lines: { create: entry.lines.map((l) => ({ tenantId: ctx.tenantId, accountId: l.accountId, debitAmount: Number(l.creditAmount), creditAmount: Number(l.debitAmount), description: `Reversal: ${l.description || entry.description}` })) },
        },
      });
      await tx.journalEntry.update({ where: { id: entry.id }, data: { isReversed: true, reversedEntryId: rev.id, reversedBy: requireAuthUserId(req), reversedAt: new Date() } });
      return { id: rev.id.toString(), entryNumber: rev.entryNumber };
    });

    logger.info('Journal entry reversed', { originalEntryId: req.params.id, reversalNumber: result.entryNumber });
    void logActivity({
      tenantId: ctx.tenantId, userId: req.user ? BigInt(req.user.userId) : undefined,
      action: 'JE_REVERSE', entityType: 'journal_entry', entityId: entry.id,
      description: `Journal entry ${entry.entryNumber} reversed (${result.entryNumber})`,
      oldValues: { isReversed: false, reversedEntryId: null },
      newValues: { isReversed: true, reversedEntryId: result.id, reversalNumber: result.entryNumber, reason },
      ipAddress: req.ip || '', userAgent: (req.headers['user-agent'] as string) || '',
    });
    res.status(201).json({ data: result });
  } catch (error: any) { logger.error('Journal reverse failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

export default router;
