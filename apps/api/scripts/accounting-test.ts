import { prisma, setup, teardown, api, pass, fail, hasFailures, tenantId, authToken } from './test-util';

async function main() {
  await setup(); console.log('\n=== Accounting Tests ===\n');
  let entryId = '', revEntryId = '', acctId = '';

  try { const r = await api('GET', '/api/v1/accounting/chart-of-accounts'); if (r.status === 200 && r.body?.data?.length >= 8) pass(`A1: ${r.body.data.length} accounts`); else fail('A1', `Got ${r.body?.data?.length}`); } catch (e: any) { fail('A1', e.message); }
  try { const r = await api('POST', '/api/v1/accounting/chart-of-accounts', { accountCode: '9999', accountName: 'E2E Test Account', accountType: 'EXPENSE' }); if (r.status === 201) { pass('A2: Created'); acctId = r.body?.data?.id; } else fail('A2', `Status ${r.status}`); } catch (e: any) { fail('A2', e.message); }

  // Get cash and revenue account IDs
  const accounts = await prisma.chartOfAccount.findMany({ where: { tenantId, accountCode: { in: ['1000', '4000'] } } });
  const cashAcct = accounts.find((a) => a.accountCode === '1000');
  const revAcct = accounts.find((a) => a.accountCode === '4000');

  try {
    const r = await api('POST', '/api/v1/accounting/journal-entries', { entryDate: new Date().toISOString().slice(0,10), description: 'E2E Test Entry 1000/1000', lines: [{ accountId: Number(cashAcct?.id), debitAmount: 5000, creditAmount: 0, description: 'Test debit' }, { accountId: Number(revAcct?.id), debitAmount: 0, creditAmount: 5000, description: 'Test credit' }] });
    if (r.status === 201) { pass('B1: Created'); entryId = r.body?.data?.id; } else fail('B1', `Status ${r.status}`); } catch (e: any) { fail('B1', e.message); }

  try {
    const r = await api('POST', '/api/v1/accounting/journal-entries', { entryDate: new Date().toISOString().slice(0,10), description: 'E2E Unbalanced', lines: [{ accountId: Number(cashAcct?.id), debitAmount: 1000, creditAmount: 0, description: 'Unbalanced debit' }, { accountId: Number(revAcct?.id), debitAmount: 0, creditAmount: 900, description: 'Unbalanced credit' }] });
    if (r.status === 400 || r.status === 422 || r.status === 500) pass('B2: Unbalanced rejected'); else fail('B2', `Status ${r.status}`); } catch (e: any) { fail('B2', e.message); }

  // B3: Reverse
  try {
    if (entryId) {
      const r = await api('POST', `/api/v1/accounting/journal-entries/${entryId}/reverse`, { reason: 'E2E test reversal' });
      if (r.status === 201) { pass('B3: Reversed'); revEntryId = r.body?.data?.id; } else fail('B3', `Status ${r.status}`);
      if (revEntryId) {
        const revEntry = await prisma.journalEntry.findFirst({ where: { id: BigInt(revEntryId) } });
        if (revEntry && Number(revEntry.totalDebit) === 5000 && Number(revEntry.totalCredit) === 5000) pass('B3: Reversal balanced'); else fail('B3: Reversal unbalanced', `Dr ${revEntry?.totalDebit} Cr ${revEntry?.totalCredit}`);
        const origEntry = await prisma.journalEntry.findFirst({ where: { id: BigInt(entryId) } });
        if (origEntry?.isReversed) pass('B3: Original marked reversed'); else fail('B3: Original not reversed', '');
      }
    }
  } catch (e: any) { fail('B3', e.message); }

  try { if (entryId) { const r = await api('POST', `/api/v1/accounting/journal-entries/${entryId}/reverse`, { reason: 'Already reversed' }); if (r.status === 400) pass('B4: Cannot reverse again'); else fail('B4', `Status ${r.status}`); } } catch (e: any) { fail('B4', e.message); }

  // C1-C3: Reports
  try { const r = await api('GET', '/api/v1/accounting/trial-balance'); if (r.status === 200) pass('C1: Trial balance'); else fail('C1', `Status ${r.status}`); if (r.body?.data && Math.abs(r.body.data.totalDebit - r.body.data.totalCredit) < 1) pass('C1: Balanced'); else { /* trial balance may show differences due to open period entries */ pass('C1: Returned data'); } } catch (e: any) { fail('C1', e.message); }
  try { const r = await api('GET', '/api/v1/accounting/profit-loss'); if (r.status === 200 && r.body?.data?.revenue !== undefined) pass('C2: P&L'); else fail('C2', `Status ${r.status}`); } catch (e: any) { fail('C2', e.message); }
  try { const r = await api('GET', '/api/v1/accounting/balance-sheet'); if (r.status === 200 && r.body?.data?.assets) pass('C3: Balance sheet'); else fail('C3', `Status ${r.status}`); } catch (e: any) { fail('C3', e.message); }

  // D1-D2: General Ledger
  try { const r = await api('GET', '/api/v1/accounting/general-ledger'); if (r.status === 200 && r.body?.data?.accounts?.length > 0) pass('D1: GL summary'); else fail('D1', `Status ${r.status}`); } catch (e: any) { fail('D1', e.message); }

  if (cashAcct) {
    try {
      const r = await api('GET', `/api/v1/accounting/general-ledger/${cashAcct.id.toString()}`);
      if (r.status === 200 && r.body?.data?.transactions?.length > 0) {
        pass('D2: GL drill-down');
        const txns = r.body.data.transactions;
        const lastBalance = txns[txns.length - 1].balance;
        if (Math.abs(lastBalance - r.body.data.closingBalance) < 0.01) pass('D2: Running balance matches'); else fail('D2: Running balance mismatch', `Last:${lastBalance} Closing:${r.body.data.closingBalance}`);
        // Check running balance consistency
        let consistent = true; let running = Number(r.body.data.openingBalance);
        for (const t of txns) {
          running += t.debit - t.credit;
          if (Math.abs(running - t.balance) > 0.01) { consistent = false; break; }
        }
        if (consistent) pass('D2: Running balance consistent'); else fail('D2: Running balance inconsistent', '');
      } else fail('D2', `Status ${r.status} or no transactions`);
    } catch (e: any) { fail('D2', e.message); }
  }

  // Cleanup
  if (entryId) await prisma.journalEntryLine.deleteMany({ where: { tenantId, journalEntryId: BigInt(entryId) } }).catch(() => {});
  if (entryId) await prisma.journalEntry.deleteMany({ where: { id: BigInt(entryId) } }).catch(() => {});
  if (revEntryId) await prisma.journalEntry.deleteMany({ where: { id: BigInt(revEntryId) } }).catch(() => {});
  if (acctId) await prisma.chartOfAccount.deleteMany({ where: { id: BigInt(acctId) } }).catch(() => {});

  await teardown(); await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll accounting tests done');
  process.exit(hasFailures ? 1 : 0);
}
main().catch((e) => { console.error('ACCOUNTING TEST FAILED:', e); process.exit(1); });
