import { test, expect, request, APIRequestContext } from '@playwright/test';

// Cross-tenant isolation negative tests (API-level, no UI).
// Guards the Priority-1 tenant-scoping fixes: every bare-id read that was
// scoped to ctx.tenantId must reject cross-tenant access with 404/400.
// Self-contained: registers its own tenant B, so it never depends on
// other tests' fixtures and never touches the demo tenant's data.
const API = 'http://localhost:3000/api/v1';
const STAMP = Date.now().toString(36);

let api: APIRequestContext;
let tokA = '';
let tokB = '';
let backupIdA = 0;
let victimId = 0;
let roleAId = 0;
let userBId = 0;
let fyAId = 0;

function subOfJwt(token: string): string {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub as string;
}

async function post(path: string, token: string, body?: any) {
  const res = await api.post(API + path, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    data: body ?? {},
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

async function get(path: string, token: string) {
  const res = await api.get(API + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

test.beforeAll(async () => {
  api = await request.newContext();
  // Tenant A (demo): admin login, backup, victim customer, role id, FY id
  const loginA = await post('/auth/login', '', { email: 'admin@demo.com', password: 'admin123' });
  expect(loginA.status).toBe(200);
  tokA = (loginA.body as any).data.accessToken;
  const bk = await post('/backups', tokA, { backupType: 'config' });
  expect(bk.status).toBe(200);
  backupIdA = Number((bk.body as any).data.id);
  const vc = await post('/customers', tokA, { fullName: `Isolation Victim ${STAMP}`, phone: `0300999${STAMP}`.slice(0, 20), creditLimit: 1000 });
  expect(vc.status).toBe(201);
  victimId = Number((vc.body as any).data.id);
  const roles = await get('/rbac/roles', tokA);
  roleAId = Number(((roles.body as any).data ?? [])[0]?.id ?? 0);
  expect(roleAId).toBeGreaterThan(0);
  const fys = await get('/financial-years', tokA);
  fyAId = Number(((fys.body as any).data ?? [])[0]?.id ?? 0);
  // Tenant B: fresh tenant via public registration (dev), then login
  const slug = `iso-b-${STAMP}`;
  const reg = await post('/auth/register', '', {
    tenantName: 'Isolation B', slug, email: `badmin-${STAMP}@iso.test`, password: 'Admin12345', fullName: 'B Admin',
  });
  expect(reg.status).toBe(201);
  const loginB = await post('/auth/login', '', { email: `badmin-${STAMP}@iso.test`, password: 'Admin12345' });
  expect(loginB.status).toBe(200);
  tokB = (loginB.body as any).data.accessToken;
  userBId = Number(subOfJwt(tokB));
});

test.afterAll(async () => {
  // Cleanup demo-tenant fixtures so repeated runs don't accumulate junk
  // (same lesson as the e2eviewer account poisoning: tests must not leave
  // state behind). Best-effort: failures here must not fail the suite.
  try {
    if (tokA && victimId) {
      await api.delete(`${API}/customers/${victimId}`, {
        headers: { Authorization: `Bearer ${tokA}` },
      }).catch(() => null);
    }
    if (tokA && backupIdA) {
      await api.delete(`${API}/backups/${backupIdA}`, {
        headers: { Authorization: `Bearer ${tokA}` },
      }).catch(() => null);
    }
  } catch { /* ignore cleanup errors */ }
  await api.dispose();
});

test('tenant B cannot validate tenant A backup', async () => {
  const r = await get(`/backups/${backupIdA}/validate`, tokB);
  expect(r.status).toBe(404);
});

test('tenant B cannot download tenant A backup', async () => {
  const res = await api.get(`${API}/backups/${backupIdA}/download`, {
    headers: { Authorization: `Bearer ${tokB}` },
  });
  expect(res.status()).toBe(404);
});

test('tenant B checkout with tenant A customer is rejected', async () => {
  const r = await post('/pos/checkout', tokB, {
    items: [{ productId: 1, quantity: 1, unitPrice: 10 }],
    payments: [{ method: 'CREDIT', amount: 5 }],
    customerId: victimId,
  });
  expect(r.status).toBe(400);
  expect(JSON.stringify(r.body)).toContain('Customer not found');
});

test('tenant B cannot request restore of tenant A backup', async () => {
  const r = await post(`/backups/${backupIdA}/restore/request`, tokB);
  expect(r.status).toBe(404);
});

test('tenant B cannot assign tenant A role', async () => {
  const r = await post(`/rbac/roles/${roleAId}/users/${userBId}`, tokB);
  expect(r.status).toBe(404);
});

test('tenant B cannot create user with tenant A role', async () => {
  const r = await post('/users', tokB, {
    username: `xuser-${STAMP}`, email: `xuser-${STAMP}@iso.test`, password: 'Xuser12345', fullName: 'X User', roleId: roleAId,
  });
  expect(r.status).toBe(400);
});

test('tenant B trial balance ignores foreign financial year', async () => {
  const plain = await get('/accounting/trial-balance', tokB);
  const foreign = await get(`/accounting/trial-balance?financialYearId=${fyAId}`, tokB);
  expect(plain.status).toBe(200);
  expect(foreign.status).toBe(200);
  expect(JSON.stringify(foreign.body)).toBe(JSON.stringify(plain.body));
});
