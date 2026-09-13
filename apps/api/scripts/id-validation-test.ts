import { prisma, setup, teardown, api, pass, fail, hasFailures, authToken, namedId, productAId, vendorAId } from './test-util';

async function main() {
  await setup(); console.log('\n=== ID Param Validation Tests ===\n');

  // Negative: non-numeric / zero / negative ids -> 400 (not 500, not P2025)
  const bad = ['abc', '0', '-5'];
  for (const b of bad) {
    try { const r = await api('GET', `/api/v1/customers/${b}`, undefined, authToken); if (r.status === 400) pass(`V1: customer ${b} -> 400`); else fail(`V1: customer ${b}`, `Status ${r.status}`); } catch (e: any) { fail(`V1: customer ${b}`, e.message); }
    try { const r = await api('GET', `/api/v1/products/${b}`, undefined, authToken); if (r.status === 400) pass(`V2: product ${b} -> 400`); else fail(`V2: product ${b}`, `Status ${r.status}`); } catch (e: any) { fail(`V2: product ${b}`, e.message); }
    try { const r = await api('GET', `/api/v1/vendors/${b}`, undefined, authToken); if (r.status === 400) pass(`V3: vendor ${b} -> 400`); else fail(`V3: vendor ${b}`, `Status ${r.status}`); } catch (e: any) { fail(`V3: vendor ${b}`, e.message); }
  }

  // Positive: valid ids still work
  try { const r = await api('GET', `/api/v1/customers/${namedId}`, undefined, authToken); if (r.status === 200) pass('V4: valid customer 200'); else fail('V4', `Status ${r.status}`); } catch (e: any) { fail('V4', e.message); }
  try { const r = await api('GET', `/api/v1/products/${productAId}`, undefined, authToken); if (r.status === 200) pass('V5: valid product 200'); else fail('V5', `Status ${r.status}`); } catch (e: any) { fail('V5', e.message); }
  try { const r = await api('GET', `/api/v1/vendors/${vendorAId}`, undefined, authToken); if (r.status === 200) pass('V6: valid vendor 200'); else fail('V6', `Status ${r.status}`); } catch (e: any) { fail('V6', e.message); }

  await teardown(); await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll id-validation tests done');
  process.exit(hasFailures ? 1 : 0);
}
main().catch((e) => { console.error('ID VALIDATION TEST FAILED:', e); process.exit(1); });
