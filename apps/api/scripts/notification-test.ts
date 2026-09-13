import { prisma, setup, teardown, api, pass, fail, hasFailures, authToken, cashierToken } from './test-util';

async function main() {
  await setup(); console.log('\n=== Notification RBAC Tests ===\n');

  // Positive: superadmin (manager) can list + unread-count
  try { const r = await api('GET', '/api/v1/notifications', undefined, authToken); if (r.status === 200 && Array.isArray(r.body?.data)) pass('N1: Admin list 200'); else fail('N1', `Status ${r.status}`); } catch (e: any) { fail('N1', e.message); }
  try { const r = await api('GET', '/api/v1/notifications/unread-count', undefined, authToken); if (r.status === 200 && typeof r.body?.data?.count === 'number') pass('N2: Admin unread-count'); else fail('N2', `Status ${r.status}`); } catch (e: any) { fail('N2', e.message); }

  // Negative: cashier role lacks notifications.view -> 403
  try { const r = await api('GET', '/api/v1/notifications', undefined, cashierToken); if (r.status === 403) pass('N3: Cashier denied 403'); else fail('N3', `Status ${r.status}`); } catch (e: any) { fail('N3', e.message); }
  try { const r = await api('PATCH', '/api/v1/notifications/read-all', {}, cashierToken); if (r.status === 403) pass('N4: Cashier read-all denied'); else fail('N4', `Status ${r.status}`); } catch (e: any) { fail('N4', e.message); }

  // Negative: invalid token -> 401 (mount-level auth)
  try { const r = await api('GET', '/api/v1/notifications', undefined, 'invalid.token.here'); if (r.status === 401 || r.status === 403) pass(`N5: Bad token rejected ${r.status}`); else fail('N5', `Status ${r.status}`); } catch (e: any) { fail('N5', e.message); }

  await teardown(); await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll notification tests done');
  process.exit(hasFailures ? 1 : 0);
}
main().catch((e) => { console.error('NOTIFICATION TEST FAILED:', e); process.exit(1); });
