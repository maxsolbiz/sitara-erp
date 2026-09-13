import { prisma, setup, teardown, api, pass, fail, hasFailures, authToken, tenantId } from './test-util';
import { generateAccessToken, hashPassword } from '../src/utils/helpers';

async function main() {
  await setup(); console.log('\n=== Notification RBAC Tests ===\n');

  // Dedicated permissionless user for negative cases (shared cashier role
  // legitimately holds notifications.view since the backfill).
  let bareRole = await prisma.role.findFirst({ where: { tenantId, slug: 'notif-test-bare' } });
  if (!bareRole) bareRole = await prisma.role.create({ data: { tenantId, name: 'Notif Test Bare', slug: 'notif-test-bare' } });
  let bare = await prisma.user.findFirst({ where: { username: 'notifbare', tenantId } });
  if (!bare) {
    bare = await prisma.user.create({
      data: { tenantId, username: 'notifbare', email: 'notifbare@test.com', passwordHash: await hashPassword('bare123'), fullName: 'Notif Bare', isActive: true, status: 'active' },
    });
  }
  const link = await prisma.roleUser.findUnique({ where: { userId_roleId: { userId: bare.id, roleId: bareRole.id } } });
  if (!link) await prisma.roleUser.create({ data: { userId: bare.id, roleId: bareRole.id } });
  const bareToken = generateAccessToken({ userId: bare.id, tenantId, tenantSlug: 'test-tenant' });

  // Positive: superadmin (manager) can list + unread-count
  try { const r = await api('GET', '/api/v1/notifications', undefined, authToken); if (r.status === 200 && Array.isArray(r.body?.data)) pass('N1: Admin list 200'); else fail('N1', `Status ${r.status}`); } catch (e: any) { fail('N1', e.message); }
  try { const r = await api('GET', '/api/v1/notifications/unread-count', undefined, authToken); if (r.status === 200 && typeof r.body?.data?.count === 'number') pass('N2: Admin unread-count'); else fail('N2', `Status ${r.status}`); } catch (e: any) { fail('N2', e.message); }

  // Negative: permissionless user -> 403
  try { const r = await api('GET', '/api/v1/notifications', undefined, bareToken); if (r.status === 403) pass('N3: Bare user denied 403'); else fail('N3', `Status ${r.status}`); } catch (e: any) { fail('N3', e.message); }
  try { const r = await api('PATCH', '/api/v1/notifications/read-all', {}, bareToken); if (r.status === 403) pass('N4: Bare user read-all denied'); else fail('N4', `Status ${r.status}`); } catch (e: any) { fail('N4', e.message); }

  // Negative: invalid token -> 401 (mount-level auth)
  try { const r = await api('GET', '/api/v1/notifications', undefined, 'invalid.token.here'); if (r.status === 401 || r.status === 403) pass(`N5: Bad token rejected ${r.status}`); else fail('N5', `Status ${r.status}`); } catch (e: any) { fail('N5', e.message); }

  await teardown(); await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll notification tests done');
  process.exit(hasFailures ? 1 : 0);
}
main().catch((e) => { console.error('NOTIFICATION TEST FAILED:', e); process.exit(1); });
