import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { logActivity } from '../utils/activity';

export class AccountingService {
  async getChartOfAccounts() {
    const ctx = getTenantContext();
    if (!ctx) return [];
    const accounts = await prisma.chartOfAccount.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { accountCode: 'asc' },
    });
    return accounts.map((a) => ({ id: a.id.toString(), accountCode: a.accountCode, accountName: a.accountName, accountType: a.accountType, parentId: a.parentId?.toString() || null, isBankAccount: a.isBankAccount, isActive: a.isActive, openingBalance: Number(a.openingBalance), currentBalance: Number(a.currentBalance), createdAt: a.createdAt, updatedAt: a.updatedAt }));
  }

  async createAccount(data: any) {
    const ctx = getTenantContext(); if (!ctx) throw new Error('No tenant');
    const a = await prisma.chartOfAccount.create({
      data: { tenantId: ctx.tenantId, accountCode: data.accountCode, accountName: data.accountName, accountType: data.accountType, parentId: data.parentId ? BigInt(data.parentId) : null, isBankAccount: data.isBankAccount || false, openingBalance: data.openingBalance || 0 },
    });
    return { id: a.id.toString() };
  }

  async getJournalEntries(page = 1, perPage = 20) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    const [items, total] = await Promise.all([
      prisma.journalEntry.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { entryDate: 'desc' }, skip: (page - 1) * perPage, take: perPage, include: { lines: { include: { account: { select: { accountName: true, accountCode: true } } } } } }),
      prisma.journalEntry.count({ where: { tenantId: ctx.tenantId } }),
    ]);
    return { items: items.map((e) => ({ id: e.id.toString(), entryNumber: e.entryNumber, entryDate: e.entryDate, description: e.description, totalDebit: Number(e.totalDebit), totalCredit: Number(e.totalCredit), isReversed: e.isReversed, referenceType: e.referenceType, referenceId: e.referenceId?.toString() || null, createdAt: e.createdAt, lines: e.lines?.map((l) => ({ id: l.id.toString(), accountId: l.accountId.toString(), debitAmount: Number(l.debitAmount), creditAmount: Number(l.creditAmount), description: l.description, account: l.account })) })), total, page };
  }

  async createJournalEntry(data: any, meta?: { userId?: bigint; ipAddress?: string; userAgent?: string }) {
    const ctx = getTenantContext(); if (!ctx) throw new Error('No tenant');
    // Fail-closed (was createdBy: tenantId — a tenant id is not a user):
    // the caller always passes the authenticated user id; refuse rather
    // than forge attribution.
    const createdBy = meta?.userId;
    if (!createdBy) throw new Error('Missing authenticated user for journal entry');
    const entryNumber = `JE-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
    const totalDebit = data.lines.reduce((s: number, l: any) => s + (l.debitAmount || 0), 0);
    const totalCredit = data.lines.reduce((s: number, l: any) => s + (l.creditAmount || 0), 0);
    const result = await prisma.$transaction(async (tx) => {
      if (Math.abs(totalDebit - totalCredit) > 0.01) throw new Error('Debits must equal credits');
      const entry = await tx.journalEntry.create({
        data: { tenantId: ctx.tenantId, entryNumber, entryDate: new Date(data.entryDate), description: data.description, totalDebit, totalCredit, createdBy, lines: { create: data.lines.map((l: any) => ({ tenantId: ctx.tenantId, accountId: BigInt(l.accountId), debitAmount: l.debitAmount || 0, creditAmount: l.creditAmount || 0, description: l.description || null })) } },
      });
      return { id: entry.id.toString(), entryNumber: entry.entryNumber };
    });
    // Logged AFTER commit — never inside the transaction (a logging failure
    // must not roll back financial data).
    void logActivity({
      tenantId: ctx.tenantId, userId: meta?.userId, action: 'JE_CREATE', entityType: 'journal_entry',
      entityId: BigInt(result.id), description: `Journal entry ${result.entryNumber} created`,
      newValues: { entryNumber: result.entryNumber, totalDebit, totalCredit, lines: data.lines },
      ipAddress: meta?.ipAddress, userAgent: meta?.userAgent,
    });
    return result;
  }

  async getTrialBalance(financialYearId?: bigint) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    const accounts = await prisma.chartOfAccount.findMany({ where: { tenantId: ctx.tenantId, isActive: true }, orderBy: { accountCode: 'asc' } });
    const jeWhere: any = { isReversed: false };
    if (financialYearId) {
      const fy = await prisma.financialYear.findFirst({ where: { id: financialYearId, tenantId: ctx.tenantId } });
      if (fy) jeWhere.entryDate = { gte: fy.startDate, lte: fy.endDate };
    }
    const lines = await prisma.journalEntryLine.findMany({
      where: { tenantId: ctx.tenantId, journalEntry: jeWhere },
      select: { accountId: true, debitAmount: true, creditAmount: true },
    });
    const balances: Record<string, { debit: number; credit: number }> = {};
    for (const a of accounts) balances[a.accountCode] = { debit: 0, credit: 0 };
    for (const l of lines) {
      const acct = accounts.find((a) => a.id === l.accountId);
      if (acct) {
        if (!balances[acct.accountCode]) balances[acct.accountCode] = { debit: 0, credit: 0 };
        balances[acct.accountCode].debit += Number(l.debitAmount);
        balances[acct.accountCode].credit += Number(l.creditAmount);
      }
    }
    const result = accounts.map((a) => {
      const b = balances[a.accountCode] || { debit: 0, credit: 0 };
      const debit = Number(a.openingBalance) > 0 ? Number(a.openingBalance) + b.debit : b.debit;
      const credit = Number(a.openingBalance) < 0 ? Math.abs(Number(a.openingBalance)) + b.credit : b.credit;
      let balance = 0;
      if (['ASSET', 'EXPENSE'].includes(a.accountType)) balance = debit - credit;
      else balance = credit - debit;
      return { code: a.accountCode, name: a.accountName, type: a.accountType, debit, credit, balance };
    });
    const totalDebit = result.reduce((s, r) => s + r.debit, 0);
    const totalCredit = result.reduce((s, r) => s + r.credit, 0);
    return { accounts: result, totalDebit, totalCredit };
  }

  async getProfitLoss(financialYearId?: bigint) {
    const tb = await this.getTrialBalance(financialYearId);
    const revenue = tb.accounts.filter((a) => a.type === 'REVENUE');
    const expenses = tb.accounts.filter((a) => a.type === 'EXPENSE');
    const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.balance, 0);
    return { revenue: { items: revenue, total: totalRevenue }, expenses: { items: expenses, total: totalExpenses }, netProfit: totalRevenue - totalExpenses, netLoss: totalRevenue < totalExpenses ? totalExpenses - totalRevenue : 0 };
  }

  async getBalanceSheet(financialYearId?: bigint) {
    const tb = await this.getTrialBalance(financialYearId);
    const assets = tb.accounts.filter((a) => a.type === 'ASSET' && a.balance !== 0);
    const liabilities = tb.accounts.filter((a) => a.type === 'LIABILITY' && a.balance !== 0);
    const equity = tb.accounts.filter((a) => a.type === 'EQUITY' && a.balance !== 0);

    // Calculate net income from revenue and expense accounts (current period earnings)
    const revenue = tb.accounts.filter((a) => a.type === 'REVENUE');
    const expenses = tb.accounts.filter((a) => a.type === 'EXPENSE');
    const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.balance, 0);
    const netIncome = totalRevenue - totalExpenses;

    // Build equity items including current period earnings
    const equityItems = [
      ...equity,
      ...(netIncome > 0 ? [{ code: '--', name: 'Net Profit (Current Period)', type: 'EQUITY', balance: netIncome }] : []),
      ...(netIncome < 0 ? [{ code: '--', name: 'Net Loss (Current Period)', type: 'EQUITY', balance: Math.abs(netIncome) }] : []),
    ];
    const totalEquity = equityItems.reduce((s, e) => s + Math.abs(e.balance), 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + Math.abs(l.balance), 0);
    const totalAssets = assets.reduce((s, a) => s + Math.abs(a.balance), 0);

    return {
      assets: { items: assets, total: totalAssets },
      liabilities: { items: liabilities, total: totalLiabilities },
      equity: { items: equityItems, total: totalEquity },
    };
  }
}

export const accountingService = new AccountingService();
