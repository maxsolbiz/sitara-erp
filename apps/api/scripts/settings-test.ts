import { prisma, setup, teardown, api, pass, fail, hasFailures } from './test-util';

async function main() {
  await setup(); console.log('\n=== Settings Tests ===\n');

  try { const r = await api('GET', '/api/v1/settings'); if (r.status === 200) pass('A1: Get all'); else fail('A1', `Status ${r.status}`); } catch (e: any) { fail('A1', e.message); }
  try { const r = await api('PUT', '/api/v1/settings/company', { company_name: 'E2E Test Company' }); if (r.status === 200) pass('A2: Update'); else fail('A2', `Status ${r.status}`); } catch (e: any) { fail('A2', e.message); }
  try { const r = await api('GET', '/api/v1/settings/company'); if (r.body?.data?.company_name === 'E2E Test Company') pass('A2: Persisted'); else fail('A2: Persisted', `Got ${r.body?.data?.company_name}`); } catch (e: any) { fail('A2', e.message); }
  try { const r = await api('GET', '/api/v1/settings/pos'); if (r.status === 200) pass('A3: Get POS'); else fail('A3', `Status ${r.status}`); } catch (e: any) { fail('A3', e.message); }
  try { const r = await api('PUT', '/api/v1/settings/pos', { pos_default_payment_method: 'CARD' }); if (r.status === 200) pass('A4: Update POS'); else fail('A4', `Status ${r.status}`); } catch (e: any) { fail('A4', e.message); }
  try { const r = await api('GET', '/api/v1/settings/pos'); if (r.body?.data?.pos_default_payment_method === 'CARD') pass('A4: Persisted'); else fail('A4: Persisted', `Got ${r.body?.data?.pos_default_payment_method}`); } catch (e: any) { fail('A4', e.message); }
  try { const r = await api('GET', '/api/v1/settings/receipt'); if (r.status === 200) pass('A5: Get receipt'); else fail('A5', `Status ${r.status}`); } catch (e: any) { fail('A5', e.message); }
  try { const r = await api('PUT', '/api/v1/settings/receipt', { receipt_footer: 'E2E Footer' }); if (r.status === 200) pass('A6: Update receipt'); else fail('A6', `Status ${r.status}`); } catch (e: any) { fail('A6', e.message); }
  try { const r = await api('GET', '/api/v1/settings/receipt'); if (r.body?.data?.receipt_footer === 'E2E Footer') pass('A6: Persisted'); else fail('A6: Persisted', `Got ${r.body?.data?.receipt_footer}`); } catch (e: any) { fail('A6', e.message); }
  try { const r = await api('GET', '/api/v1/settings/email'); if (r.status === 200) pass('A7: Get email'); else fail('A7', `Status ${r.status}`); } catch (e: any) { fail('A7', e.message); }
  try { const r = await api('PUT', '/api/v1/settings/email', { email_service_provider: 'none' }); if (r.status === 200) pass('A8: Update email'); else fail('A8', `Status ${r.status}`); } catch (e: any) { fail('A8', e.message); }

  // Restore
  await api('PUT', '/api/v1/settings/company', { company_name: 'Test Tenant' }).catch(() => {});
  await api('PUT', '/api/v1/settings/pos', { pos_default_payment_method: 'CASH' }).catch(() => {});

  await teardown(); await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll settings tests done');
  process.exit(hasFailures ? 1 : 0);
}
main().catch((e) => { console.error('SETTINGS TEST FAILED:', e); process.exit(1); });
