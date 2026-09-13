import prisma from '../lib/prisma';
import { hashPassword } from '../utils/helpers';

interface TestResult { name: string; pass: boolean; detail?: string; }

async function apiFetch(api: string, token: string, method = 'GET', body?: any) {
  const base = `http://localhost:3000/api/v1`;
  const opts: any = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  try {
    const res = await globalThis.fetch(`${base}${api}`, opts);
    return { status: res.status, data: await res.json().catch(() => null) as any };
  } catch { return { status: 0, data: null as any }; }
}

async function login(email: string, password: string) {
  const res = await globalThis.fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data: any = await res.json().catch(() => ({}));
  return data?.data?.accessToken || null;
}

async function main() {
  const results: TestResult[] = [];
  let passed = 0, failed = 0;
  const tenantId = 2n;
  const adminPw = await hashPassword('admin123');
  const cashierPw = await hashPassword('cashier123');

  let adminUser = await prisma.user.findFirst({ where: { tenantId, username: 'rbac-admin' } });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: { tenantId, username: 'rbac-admin', email: 'rbac-admin@test.com', passwordHash: adminPw, fullName: 'RBAC Admin', isSuperAdmin: true, status: 'active' },
    });
    const adminRole = await prisma.role.findFirst({ where: { tenantId, slug: 'admin' } });
    if (adminRole) await prisma.roleUser.create({ data: { userId: adminUser.id, roleId: adminRole.id } });
  }

  let cashierUser = await prisma.user.findFirst({ where: { tenantId, username: 'rbac-cashier' } });
  if (!cashierUser) {
    cashierUser = await prisma.user.create({
      data: { tenantId, username: 'rbac-cashier', email: 'rbac-cashier@test.com', passwordHash: cashierPw, fullName: 'RBAC Cashier', status: 'active' },
    });
    const cashierRole = await prisma.role.findFirst({ where: { tenantId, slug: 'cashier' } });
    if (cashierRole) await prisma.roleUser.create({ data: { userId: cashierUser.id, roleId: cashierRole.id } });
  }

  const adminToken = await login('rbac-admin@test.com', 'admin123');
  const cashierToken = await login('rbac-cashier@test.com', 'cashier123');
  if (!adminToken) { console.log('FAIL: Admin login failed'); process.exit(1); }
  if (!cashierToken) { console.log('FAIL: Cashier login failed'); process.exit(1); }

  // Admin can access everything
  for (const path of ['/products', '/accounting/trial-balance', '/reports/sales', '/users', '/dashboard/stats', '/settings', '/inventory/warehouses']) {
    const r = await apiFetch(path, adminToken);
    const pass = r.status === 200;
    results.push({ name: `Admin: GET ${path}`, pass, detail: pass ? '200 OK' : `${r.status}` });
    if (pass) passed++; else failed++;
  }

  // Cashier allowed
  for (const path of ['/pos/init', '/sales?perPage=1', '/customers?perPage=1']) {
    const r = await apiFetch(path, cashierToken);
    const pass = r.status === 200;
    results.push({ name: `Cashier: GET ${path} (should pass)`, pass, detail: pass ? '200 OK' : `${r.status}` });
    if (pass) passed++; else failed++;
  }

  // Cashier denied
  const deniedPaths = [
    '/accounting/trial-balance', '/reports/sales', '/users', '/settings', '/dashboard/stats',
    '/inventory/warehouses', '/products', '/purchases/orders', '/vendors', '/expenses',
    '/accounting/chart-of-accounts', '/accounting/journal-entries', '/accounting/general-ledger',
    '/financial-years', '/pricing-tiers', '/loans', '/rbac/roles', '/search?q=test',
  ];
  for (const path of deniedPaths) {
    const r = await apiFetch(path, cashierToken);
    const pass = r.status === 401 || r.status === 403;
    results.push({ name: `Cashier: GET ${path} (should 403)`, pass, detail: pass ? `${r.status} (expected)` : `${r.status} (expected 401/403)` });
    if (pass) passed++; else failed++;
  }

  // Cashier cannot create PO
  const poCreate = await apiFetch('/purchases/orders', cashierToken, 'POST', {
    vendorId: 1, orderDate: new Date().toISOString(),
    items: [{ productId: 1, quantity: 1, unitCost: 100, lineTotal: 100 }],
  });
  const poPass = poCreate.status === 401 || poCreate.status === 403;
  results.push({ name: 'Cashier: POST /purchases/orders (should 403)', pass: poPass, detail: `${poCreate.status}` });
  if (poPass) passed++; else failed++;

  // Cashier can POS checkout
  const posCheck = await apiFetch('/pos/checkout', cashierToken, 'POST', {
    items: [{ productId: 105, quantity: 1, unitPrice: 1000, discountAmount: 0 }],
    payments: [{ method: 'CASH', amount: 1000 }],
  });
  results.push({ name: 'Cashier: POST /pos/checkout (should pass)', pass: posCheck.status === 201, detail: `${posCheck.status}` });
  if (posCheck.status === 201) passed++; else failed++;

  // ── Data Scoping Tests ──
  // Cashier creates a sale via API
  const cashierSale = await apiFetch('/pos/checkout', cashierToken, 'POST', {
    items: [{ productId: 106, quantity: 1, unitPrice: 500, discountAmount: 0 }],
    payments: [{ method: 'CASH', amount: 500 }],
  });
  if (cashierSale.status === 201) {
    // Cashier lists sales — should see at least their own sale
    const cashierSales: any = await apiFetch('/sales?perPage=50', cashierToken);
    const cashierIds = cashierSales.data?.map((s: any) => s.id) || [];
    // Admin lists all sales
    const adminSales: any = await apiFetch('/sales?perPage=50', adminToken);
    const adminIds = adminSales.data?.map((s: any) => s.id) || [];
    const cashierOwn = cashierIds.length;
    const adminAll = adminIds.length;
    // Cashier should see FEWER sales than admin (scoping)
    const scopingWorks = cashierOwn < adminAll;
    results.push({ name: 'DataScope: Cashier sees fewer sales than admin', pass: scopingWorks, detail: `Cashier: ${cashierOwn}, Admin: ${adminAll}` });
    if (scopingWorks) passed++; else failed++;
  } else {
    results.push({ name: 'DataScope: Cashier sale creation (prerequisite)', pass: false, detail: `${cashierSale.status}` });
    failed++;
  }

  // Cashier accesses /sales/returns (should work but be scoped)
  const cashierReturns = await apiFetch('/sales-returns', cashierToken);
  results.push({ name: 'DataScope: Cashier GET /sales-returns (should pass)', pass: cashierReturns.status === 200, detail: `${cashierReturns.status}` });
  if (cashierReturns.status === 200) passed++; else failed++;

  // Results
  console.log(`\n=== RBAC TEST RESULTS ===`);
  for (const r of results) {
    console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name} — ${r.detail}`);
  }
  console.log(`\nPassed: ${passed}/${results.length}`);
  if (failed > 0) console.log(`Failed: ${failed}/${results.length}`);

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
