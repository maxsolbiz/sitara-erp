/**
 * Session tracking regression test (requires live API on localhost:3000).
 * Proves: login creates a row, termination actually kills the token,
 * refresh cannot resurrect a terminated session, and termination of one
 * device does not cross-contaminate another device of the same user.
 */
const BASE = 'http://localhost:3000/api/v1';

let passed = 0;
let failed = 0;
function pass(name: string) { passed++; console.log(`  [PASS] ${name}`); }
function fail(name: string, reason: string) { failed++; console.log(`  [FAIL] ${name} — ${reason}`); }

async function login(email: string, password: string, ua: string): Promise<{ status: number; access?: string; refresh?: string }> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
    body: JSON.stringify({ email, password }),
  });
  let body: any = {};
  try { body = await r.json(); } catch { /* ignore */ }
  return { status: r.status, access: body?.data?.accessToken, refresh: body?.data?.refreshToken };
}

async function me(token: string): Promise<number> {
  const r = await fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  await r.text().catch(() => '');
  return r.status;
}

async function sessions(token: string): Promise<any[]> {
  const r = await fetch(`${BASE}/auth/sessions`, { headers: { Authorization: `Bearer ${token}` } });
  const b: any = await r.json().catch(() => ({}));
  return Array.isArray(b?.data) ? b.data : [];
}

async function terminate(token: string, id: string): Promise<number> {
  const r = await fetch(`${BASE}/auth/sessions/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  await r.text().catch(() => '');
  return r.status;
}

async function refresh(refreshToken: string): Promise<{ status: number; access?: string }> {
  const r = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  let body: any = {};
  try { body = await r.json(); } catch { /* ignore */ }
  return { status: r.status, access: body?.data?.accessToken };
}

const EMAIL = 'admin@demo.com';
const PW = 'admin123';

async function main() {
  console.log('\n=== Session Tracking Tests ===\n');

  // 1. Login creates a row
  const a = await login(EMAIL, PW, 'sess-test-A/1.0');
  if (a.status !== 200 || !a.access || !a.refresh) { fail('S1: login', `Status ${a.status}`); return finish(); }
  pass('S1: login 200 with tokens');
  const rowsA = (await sessions(a.access)).filter((s: any) => (s.userAgent || '').includes('sess-test-A'));
  if (rowsA.length >= 1) pass('S2: session row created');
  else fail('S2: session row', 'no row for this login');
  const rowAId = rowsA[0]?.id;

  // 2. Baseline: token works
  if ((await me(a.access)) === 200) pass('S3: token works pre-terminate');
  else fail('S3: baseline', 'token rejected before termination');

  // 3. Terminate → same token must die
  if (rowAId && (await terminate(a.access, rowAId)) === 200) pass('S4: terminate 200');
  else fail('S4: terminate', 'delete failed');
  if ((await me(a.access)) === 401) pass('S5: terminated token rejected');
  else fail('S5: terminated token', 'still accepted!');

  // 4. Refresh-after-terminate must NOT resurrect
  const rr = await refresh(a.refresh!);
  if (rr.status === 401) pass('S6: refresh-after-terminate rejected');
  else fail('S6: refresh-after-terminate', `Status ${rr.status} (resurrected!)`);

  // 5. Fresh login → new row, new token works, old stays dead
  const b = await login(EMAIL, PW, 'sess-test-B/1.0');
  if (b.status === 200 && b.access) pass('S7: fresh login works');
  else fail('S7: fresh login', `Status ${b.status}`);
  if ((await me(b.access!)) === 200) pass('S8: new token works');
  else fail('S8: new token', 'rejected');
  if ((await me(a.access)) === 401) pass('S9: old token stays dead');
  else fail('S9: old token', 'came back to life!');

  // 6. Two-device: terminate X, Y unaffected (token AND refresh)
  const x = await login(EMAIL, PW, 'sess-test-X/1.0');
  const y = await login(EMAIL, PW, 'sess-test-Y/1.0');
  if (x.status !== 200 || y.status !== 200) { fail('S10: two-device login', `${x.status}/${y.status}`); return finish(); }
  pass('S10: two-device login');
  const rowsY = (await sessions(y.access!)).filter((s: any) => (s.userAgent || '').includes('sess-test-'));
  const rowX = rowsY.find((s: any) => (s.userAgent || '').includes('sess-test-X'));
  if (!rowX) { fail('S11: find X row', 'missing'); return finish(); }
  pass('S11: X row found');
  if ((await terminate(y.access!, rowX.id)) === 200) pass('S12: terminate X');
  else fail('S12: terminate X', 'failed');
  if ((await me(x.access!)) === 401) pass('S13: X token dead');
  else fail('S13: X token', 'still accepted!');
  if ((await me(y.access!)) === 200) pass('S14: Y token alive');
  else fail('S14: Y token', 'cross-contaminated!');
  const ry = await refresh(y.refresh!);
  if (ry.status === 200 && ry.access && (await me(ry.access)) === 200) pass('S15: Y refresh works');
  else fail('S15: Y refresh', `Status ${ry.status}`);

  // Cleanup: terminate leftover test rows
  for (const ua of ['sess-test-B', 'sess-test-Y']) {
    const rows = (await sessions(b.access!)).filter((s: any) => (s.userAgent || '').includes(ua));
    for (const r of rows) await terminate(b.access!, r.id).catch(() => {});
  }

  finish();
}

function finish() {
  console.log(failed > 0 ? '\nFAILURES DETECTED' : '\nAll session tracking tests done');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('SESSION TEST FAILED:', (e as Error).message); process.exit(1); });
