import { prisma, setup, teardown, api, pass, fail, hasFailures, tenantId, namedId } from './test-util';

async function main() {
  await setup(); console.log('\n=== Customer Tests ===\n');
  let custId = '';

  try { const r = await api('POST', '/api/v1/customers', { fullName: 'E2E Customer', email: 'e2e@cust.com', phone: '0300-9999999', creditLimit: 50000 }); if (r.status === 201) { pass('A1: Created'); custId = r.body?.data?.id; if (r.body?.data?.customerCode) pass('A1: Auto code'); } else fail('A1', `Status ${r.status}`); } catch (e: any) { fail('A1', e.message); }
  try { const r = await api('GET', `/api/v1/customers/${custId}`); if (r.status === 200 && r.body?.data?.creditLimit === 50000) pass('A2: Get'); else fail('A2', `Status ${r.status}`); } catch (e: any) { fail('A2', e.message); }
  try { const r = await api('PUT', `/api/v1/customers/${custId}`, { creditLimit: 60000 }); if (r.status === 200) pass('A3: Updated'); else fail('A3', `Status ${r.status}`); } catch (e: any) { fail('A3', e.message); }
  try { const r = await api('GET', '/api/v1/customers/search?q=E2E'); if (r.body?.data?.length > 0) pass('A4: Search'); else fail('A4', 'Not found'); } catch (e: any) { fail('A4', e.message); }

  // B1-B3: Customer Credit & Ledger
  try {
    await prisma.customer.update({ where: { id: BigInt(custId) }, data: { currentBalance: 10000 } });
    const r = await api('POST', `/api/v1/customers/${custId}/payments`, { amount: 4000, paymentMethod: 'CASH' });
    if (r.status === 201) pass('B1: Payment'); else fail('B1', `Status ${r.status}`);
    const cust = await prisma.customer.findFirst({ where: { id: BigInt(custId) } });
    if (cust && Number(cust.currentBalance) === 6000) pass('B1: Balance 6000'); else fail('B1: Balance', `Got ${cust?.currentBalance}`);
    const je = await prisma.journalEntry.findFirst({ where: { tenantId, description: { contains: 'Payment from' } }, orderBy: { createdAt: 'desc' } });
    if (je) pass('B1: Journal'); else fail('B1: Journal', 'Not found');
    const cl = await prisma.customerLedger.findFirst({ where: { tenantId, customerId: BigInt(custId), type: 'PAYMENT' } });
    if (cl) pass('B1: Ledger PAYMENT'); else fail('B1: Ledger', 'Not found');
  } catch (e: any) { fail('B1', e.message); }

  try { const r = await api('GET', `/api/v1/customers/${custId}/ledger`); if (r.body?.data?.length > 0 && r.body.data.every((e: any) => e.balanceBefore !== undefined)) pass('B2: Ledger'); else fail('B2', 'Missing fields'); } catch (e: any) { fail('B2', e.message); }
  try { const r = await api('GET', `/api/v1/customers/${custId}`); if (r.status === 200) pass('B3: Detail page'); else fail('B3', `Status ${r.status}`); } catch (e: any) { fail('B3', e.message); }

  await prisma.customer.update({ where: { id: BigInt(custId) }, data: { currentBalance: 0 } }).catch(() => {});
  await prisma.customerLedger.deleteMany({ where: { tenantId, customerId: BigInt(custId) } }).catch(() => {});

  await teardown(); await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll customer tests done');
  process.exit(hasFailures ? 1 : 0);
}
main().catch((e) => { console.error('CUSTOMER TEST FAILED:', e); process.exit(1); });
