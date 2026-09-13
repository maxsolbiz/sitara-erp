/**
 * Tenant isolation regression test (requires live API on localhost:3000).
 * Proves per-request tenant scoping holds under concurrent cross-tenant load.
 * Before the AsyncLocalStorage fix this showed 30/30 cross-tenant failures.
 */
const BASE = 'http://localhost:3000/api/v1';

let passed = 0;
let failed = 0;
function pass(name: string) { passed++; console.log(`  [PASS] ${name}`); }
function fail(name: string, reason: string) { failed++; console.log(`  [FAIL] ${name} — ${reason}`); }

async function login(email: string, password: string): Promise<{ status: number; token?: string }> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  let body: any = {};
  try { body = await r.json(); } catch { /* ignore */ }
  return { status: r.status, token: body?.data?.accessToken as string | undefined };
}

async function authed(path: string, token: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  let body: any = {};
  try { body = await r.json(); } catch { /* ignore */ }
  return { status: r.status, body };
}

async function main() {
  console.log('\n=== Tenant Isolation Tests ===\n');

  const t1 = await login('admin@demo.com', 'admin123');
  const t2 = await login('manager@test.com', 'manager123');
  if (t1.status !== 200 || !t1.token) { fail('setup', 'tenant1 login failed'); finish(); return; }
  if (t2.status !== 200 || !t2.token) { fail('setup', 'tenant2 login failed'); finish(); return; }
  pass('setup: both tenants logged in');
  const token1 = t1.token;
  const token2 = t2.token;

  // Part A — original repro: tenant1 login must stay 200 amid tenant2 traffic (30x)
  for (let i = 0; i < 30; i++) {
    const [st, lg] = await Promise.all([
      authed('/products?perPage=1', token2),
      login('admin@demo.com', 'admin123'),
    ]);
    void st;
    if (lg.status === 200 && lg.token) pass(`A${i + 1}: t1 login isolated`);
    else fail(`A${i + 1}: t1 login`, `Status ${lg.status}`);
  }

  // Part B — data check: tenant1 reads its own customer amid tenant2 storm
  const list = await authed('/customers?perPage=1', token1);
  const firstId = list.body?.data?.[0]?.id;
  const firstName = list.body?.data?.[0]?.fullName;
  if (!firstId) {
    fail('B-setup', 'no tenant1 customer to check');
  } else {
    for (let i = 0; i < 10; i++) {
      const [st, got] = await Promise.all([
        authed('/products?perPage=5', token2),
        authed(`/customers/${firstId}`, token1),
      ]);
      void st;
      if (got.status === 200 && got.body?.data?.id === firstId && got.body?.data?.fullName === firstName) {
        pass(`B${i + 1}: t1 own-record stable`);
      } else {
        fail(`B${i + 1}: t1 own-record`, `Status ${got.status}`);
      }
    }
  }

  // Part C — reverse direction: tenant2 login amid tenant1 traffic (10x)
  for (let i = 0; i < 10; i++) {
    const [st, lg] = await Promise.all([
      authed('/products?perPage=1', token1),
      login('manager@test.com', 'manager123'),
    ]);
    void st;
    if (lg.status === 200 && lg.token) pass(`C${i + 1}: t2 login isolated`);
    else fail(`C${i + 1}: t2 login`, `Status ${lg.status}`);
  }

  finish();
}

function finish() {
  console.log(failed > 0 ? '\nFAILURES DETECTED' : '\nAll tenant isolation tests done');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('TENANT ISOLATION TEST FAILED:', (e as Error).message); process.exit(1); });
