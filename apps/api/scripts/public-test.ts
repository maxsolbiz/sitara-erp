import { prisma, setup, teardown, api, pass, fail, hasFailures, tenantId, productAId, namedId, authToken } from './test-util';

async function main() {
  await setup(); console.log('\n=== Public Receipt Tests ===\n');

  // Create a real sale to publish via the public link
  let saleId = '';
  try {
    const r = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CASH', amount: 1000 }],
      customerId: Number(namedId),
    }, authToken);
    if (r.status === 201 && r.body?.data?.saleId) { pass('P0: Sale created'); saleId = r.body.data.saleId; }
    else fail('P0', `Status ${r.status}`);
  } catch (e: any) { fail('P0', e.message); }

  // Positive: public receipt reachable with NO auth token
  try {
    const r = await api('GET', `/api/v1/public/receipts/${saleId}`, undefined, null);
    const d = r.body?.data;
    if (r.status === 200 && d?.saleNumber && Array.isArray(d?.items) && d.items.length > 0) pass('P1: Public receipt 200');
    else fail('P1', `Status ${r.status}`);
    if (d && d.total === 1000) pass('P1: Total correct'); else fail('P1: Total', JSON.stringify(d?.total));
  } catch (e: any) { fail('P1', e.message); }

  // Negative: sensitive cost fields must NOT leak on the public shape
  try {
    const r = await api('GET', `/api/v1/public/receipts/${saleId}`, undefined, null);
    const flat = JSON.stringify(r.body?.data || {});
    const leaks = ['unitCost', 'cogsAmount', 'profitAmount', 'costPrice'].filter((k) => flat.includes(k));
    if (leaks.length === 0) pass('P2: No cost fields leaked'); else fail('P2', `Leaked: ${leaks.join(',')}`);
  } catch (e: any) { fail('P2', e.message); }

  // Negative: nonexistent numeric id -> 404 (not data)
  try {
    const r = await api('GET', '/api/v1/public/receipts/999999999', undefined, null);
    if (r.status === 404) pass('P3: Missing receipt 404'); else fail('P3', `Status ${r.status}`);
  } catch (e: any) { fail('P3', e.message); }

  // Cleanup the published sale's side effects (void via API if supported, else leave)
  await teardown(); await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll public receipt tests done');
  process.exit(hasFailures ? 1 : 0);
}
main().catch((e) => { console.error('PUBLIC TEST FAILED:', e); process.exit(1); });
