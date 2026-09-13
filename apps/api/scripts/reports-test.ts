import { prisma, setup, teardown, api, pass, fail, hasFailures } from './test-util';

async function getCsvLen(r: any): number { return r.body?.length || 0; }

async function main() {
  await setup(); console.log('\n=== Reports Tests ===\n');

  // A1-A3: Sales Report
  try {
    const r = await api('GET', '/api/v1/reports/sales');
    if (r.status === 200 && r.body?.data?.summary?.totalSales !== undefined) pass('A1: Sales report'); else fail('A1', `Status ${r.status}`);
  } catch (e: any) { fail('A1', e.message); }
  try { const r = await api('GET', '/api/v1/reports/sales?preset=this_month'); if (r.status === 200) pass('A2: With preset'); else fail('A2', `Status ${r.status}`); } catch (e: any) { fail('A2', e.message); }
  try { const r = await api('GET', '/api/v1/reports/sales/export'); if (r.status === 200) pass('A3: CSV export'); else fail('A3', `Status ${r.status}`); } catch (e: any) { fail('A3', e.message); }

  // B1-B6: Other Reports
  try { const r = await api('GET', '/api/v1/reports/purchases'); if (r.status === 200 && r.body?.data?.summary?.totalOrders !== undefined) pass('B1: Purchases'); else fail('B1', `Status ${r.status}`); } catch (e: any) { fail('B1', e.message); }
  try { const r = await api('GET', '/api/v1/reports/inventory'); if (r.status === 200 && r.body?.data?.summary?.totalProducts !== undefined) pass('B2: Inventory'); else fail('B2', `Status ${r.status}`); } catch (e: any) { fail('B2', e.message); }
  try { const r = await api('GET', '/api/v1/reports/stock-valuation'); if (r.status === 200 && r.body?.data?.totalCost !== undefined) pass('B3: Stock val'); else fail('B3', `Status ${r.status}`); } catch (e: any) { fail('B3', e.message); }
  try { const r = await api('GET', '/api/v1/reports/customer-aging'); if (r.status === 200 && r.body?.data?.summary?.totalOutstanding !== undefined) pass('B4: Aging'); else fail('B4', `Status ${r.status}`); } catch (e: any) { fail('B4', e.message); }
  try { const r = await api('GET', '/api/v1/reports/expenses'); if (r.status === 200 && r.body?.data?.summary?.totalExpenses !== undefined) pass('B5: Expenses'); else fail('B5', `Status ${r.status}`); } catch (e: any) { fail('B5', e.message); }
  try { const r = await api('GET', '/api/v1/reports/vendors'); if (r.status === 200 && r.body?.data?.summary?.totalVendors !== undefined) pass('B6: Vendors'); else fail('B6', `Status ${r.status}`); } catch (e: any) { fail('B6', e.message); }

  // C1-C5: Export Endpoints
  for (const [name, url] of [['Sales', '/reports/sales/export'], ['Purchases', '/reports/purchases/export'], ['Inventory', '/reports/inventory/export'], ['Expenses', '/reports/expenses/export'], ['Vendors', '/reports/vendors/export']]) {
    try { const r = await api('GET', `/api/v1${url}`); if (r.status === 200) pass(`C: ${name} export`); else fail(`C: ${name}`, `Status ${r.status}`); } catch (e: any) { fail(`C: ${name}`, e.message); }
  }

  await teardown(); await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll reports tests done');
  process.exit(hasFailures ? 1 : 0);
}
main().catch((e) => { console.error('REPORTS TEST FAILED:', e); process.exit(1); });
