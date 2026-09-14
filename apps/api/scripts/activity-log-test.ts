import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3000/api/v1';
let passed = 0;
let failed = 0;
function pass(n: string) { passed++; console.log(`  [PASS] ${n}`); }
function fail(n: string, r: string) { failed++; console.log(`  [FAIL] ${n} — ${r}`); }

async function login() {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'testmanager@test.com', password: 'manager123' }),
  });
  const b: any = await r.json().catch(() => ({}));
  // testmanager email may differ — fall back to known manager address
  if (!b?.data?.accessToken) {
    const r2 = await fetch(`${BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'manager@test.com', password: 'manager123' }),
    });
    const b2: any = await r2.json().catch(() => ({}));
    return { status: r2.status, token: b2?.data?.accessToken as string | undefined };
  }
  return { status: r.status, token: b?.data?.accessToken as string | undefined };
}

async function call(method: string, path: string, token: string, body?: any): Promise<{ status: number; body: any }> {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function rowsFor(action: string, entityId?: string): Promise<any[]> {
  const where: any = { tenantId: 2n, action };
  if (entityId) where.entityId = BigInt(entityId);
  return prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5 });
}

async function main() {
  console.log('\n=== Activity Log Tests ===\n');
  const lg = await login();
  if (lg.status !== 200 || !lg.token) { fail('setup', 'manager login failed'); return finish(); }
  pass('setup: manager login');
  const H = lg.token;

  // Batch 1 — auth LOGIN row
  {
    const rows = await rowsFor('LOGIN');
    const mine = rows.find((r) => r.description.includes('testmanager') || r.description.includes('manager'));
    if (mine && mine.description.length > 10) pass('L1: LOGIN row with description');
    else fail('L1: LOGIN row', 'missing/empty');
  }

  // Batch 2 — JE create + reverse with diffs
  const coa: any = (await call('GET', '/accounting/chart-of-accounts', H)).body;
  const accts: any[] = coa?.data || [];
  const cash = accts.find((a: any) => a.accountCode === '1000');
  const rev = accts.find((a: any) => a.accountCode === '4000');
  let jeId = '';
  if (cash && rev) {
    const je = await call('POST', '/accounting/journal-entries', H, {
      entryDate: new Date().toISOString().slice(0, 10), description: 'ActivityLog probe JE',
      lines: [
        { accountId: cash.id, debitAmount: 100, creditAmount: 0 },
        { accountId: rev.id, debitAmount: 0, creditAmount: 100 },
      ],
    });
    jeId = je.body?.data?.id || '';
    if (je.status === 201 && jeId) pass('L2: JE created');
    else fail('L2: JE create', `Status ${je.status}`);
    if (jeId) {
      const rv = await call('POST', `/accounting/journal-entries/${jeId}/reverse`, H, { reason: 'ActivityLog probe reversal' });
      if (rv.status === 201) pass('L3: JE reversed');
      else fail('L3: JE reverse', `Status ${rv.status}`);
    }
  } else fail('L2: JE setup', 'missing CoA accounts');
  await new Promise((r) => setTimeout(r, 2000)); // fire-and-forget writes land
  {
    const rows = jeId ? await rowsFor('JE_CREATE', jeId) : [];
    const row = rows[0];
    if (row && row.newValues && (row.newValues as any).totalDebit === 100) pass('L4: JE_CREATE row + totals');
    else fail('L4: JE_CREATE row', 'missing/wrong newValues');
  }
  {
    const rows = jeId ? await rowsFor('JE_REVERSE', jeId) : [];
    const row = rows[0];
    const old: any = row?.oldValues;
    const nw: any = row?.newValues;
    if (row && old?.isReversed === false && nw?.isReversed === true && old !== nw) pass('L5: JE_REVERSE diff present and differs');
    else fail('L5: JE_REVERSE diff', 'missing/identical');
  }

  // Batch 3 — role permission update with slug diff
  const ROLENAME = 'ActLogProbeRole';
  const rc = await call('POST', '/rbac/roles', H, { name: ROLENAME, description: 'probe' });
  const roleId = rc.body?.data?.id || '';
  if (rc.status !== 201 || !roleId) { fail('L6: role setup', `Status ${rc.status}`); }
  else {
    pass('L6: probe role created');
    const perms: any = await call('GET', '/rbac/permissions', H);
    const slugs: string[] = [];
    for (const mod of Object.values((perms.body?.data || {}) as any)) {
      for (const p of mod as any[]) { if (slugs.length < 2) slugs.push((p as any).slug); }
    }
    const pids: string[] = [];
    for (const mod of Object.values((perms.body?.data || {}) as any)) {
      for (const p of mod as any[]) { if (slugs.includes((p as any).slug)) pids.push((p as any).id); }
    }
    await call('PATCH', `/rbac/roles/${roleId}/permissions`, H, { permissionIds: pids.slice(0, 1) });
    await call('PATCH', `/rbac/roles/${roleId}/permissions`, H, { permissionIds: pids.slice(0, 2) });
    await new Promise((r) => setTimeout(r, 2000));
    const rows = await rowsFor('ROLE_UPDATE', roleId);
    const diffRow = rows.find((r: any) => {
      const o = (r.oldValues as any)?.permissions || [];
      const n = (r.newValues as any)?.permissions || [];
      return o.length === 1 && n.length === 2;
    });
    if (diffRow) pass('L7: ROLE_UPDATE perm diff 1→2');
    else fail('L7: ROLE_UPDATE diff', 'no 1→2 diff row');
    await call('DELETE', `/rbac/roles/${roleId}`, H);
  }

  // Batch 4 — product price change (+ negative: name-only edit logs nothing)
  const prods: any = await call('GET', '/products?perPage=1', H);
  const prod = (prods.body?.data || [])[0];
  if (!prod) fail('L8: product setup', 'no products');
  else {
    const pid = prod.id;
    const origPrice = Number(prod.sellingPrice);
    const before = (await rowsFor('PRODUCT_PRICE_CHANGE', pid)).length;
    await call('PUT', `/products/${pid}`, H, { name: (prod.name || 'x') + '!' });
    await new Promise((r) => setTimeout(r, 1500));
    const afterNameOnly = (await rowsFor('PRODUCT_PRICE_CHANGE', pid)).length;
    if (afterNameOnly === before) pass('L9: name-only edit logs nothing (negative)');
    else fail('L9: negative', 'spurious price row on name edit');
    await call('PUT', `/products/${pid}`, H, { name: prod.name, sellingPrice: origPrice + 5 });
    await new Promise((r) => setTimeout(r, 1500));
    const rows = await rowsFor('PRODUCT_PRICE_CHANGE', pid);
    const diffRow = rows.find((r: any) => Number((r.newValues as any)?.sellingPrice) === origPrice + 5);
    if (diffRow && Number((diffRow.oldValues as any)?.sellingPrice) === origPrice) pass('L10: price diff old→new');
    else fail('L10: price diff', 'missing/wrong');
    await call('PUT', `/products/${pid}`, H, { name: prod.name, sellingPrice: origPrice });
  }

  // Batch 5 — stock transfer (needs 2 warehouses; create temp one)
  const whs: any = await call('GET', '/inventory/warehouses', H);
  let warehouses: any[] = whs.body?.data || [];
  if (warehouses.length < 2) {
    await call('POST', '/inventory/warehouses', H, { name: 'ActLog Branch', code: 'ACTLOG-BR' });
    warehouses = ((await call('GET', '/inventory/warehouses', H)).body?.data || []);
  }
  // Find any (source, stocked-product, different-dest) triple — warehouse
  // list order is nondeterministic, so search all combinations.
  let src: any = null;
  let dest: any = null;
  let stocked: any = null;
  for (const w of warehouses) {
    const stock: any = await call('GET', `/inventory/stock?warehouseId=${w.id}`, H);
    const found = ((stock.body?.data || []) as any[]).find((s: any) => (s.quantity || 0) > 2);
    if (found) {
      const other = warehouses.find((o: any) => o.id !== w.id);
      if (other) { src = w; dest = other; stocked = found; break; }
    }
  }
  if (!src || !dest) fail('L11: transfer setup', 'need 2 warehouses');
  else if (!stocked) fail('L11: transfer setup', 'no stocked product');
  else {
    const tr = await call('POST', '/inventory/transfers', H, {
      fromWarehouseId: Number(src.id), toWarehouseId: Number(dest.id),
      items: [{ productId: Number(stocked.productId || stocked.product?.id), quantity: 1 }],
    });
    const tid = tr.body?.data?.id || '';
    if ((tr.status === 200 || tr.status === 201) && tid) pass('L12: transfer created');
    else fail('L12: transfer', `Status ${tr.status}`);
    await new Promise((r) => setTimeout(r, 2000));
    const rows = tid ? await prisma.activityLog.findMany({ where: { tenantId: 2n, action: 'STOCK_TRANSFER', entityId: BigInt(tid) } }) : [];
    const row = rows[0] as any;
    if (row && (row.newValues as any)?.toWarehouse && (row.newValues as any)?.items?.length === 1) pass('L13: STOCK_TRANSFER row + warehouses/items');
    else fail('L13: STOCK_TRANSFER row', 'missing/incomplete');
  }

  await prisma.$disconnect();
  finish();
}

function finish() {
  console.log(failed > 0 ? '\nFAILURES DETECTED' : '\nAll activity log tests done');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('ACTIVITY LOG TEST FAILED:', (e as Error).message); process.exit(1); });
