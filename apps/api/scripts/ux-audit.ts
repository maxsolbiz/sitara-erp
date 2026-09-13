import { PrismaClient } from '@prisma/client';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../src/routes';
import { generateAccessToken } from '../src/utils/helpers';
import { setTenantContext } from '../src/lib/prisma';

const prisma = new PrismaClient();
let server: http.Server, baseUrl: string;
let token = '';

let passed = 0, failed = 0;
let issues: string[] = [];

function pass(m: string) { passed++; console.log(`  [PASS] ${m}`); }
function fail(m: string, r: string) { failed++; issues.push(`${m}: ${r}`); console.log(`  [FAIL] ${m} — ${r}`); }

async function api(method: string, path: string, body?: any, t?: string) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts: http.RequestOptions = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json' } };
    if (t || token) opts.headers!['Authorization'] = `Bearer ${t || token}`;
    const req = http.request(opts, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => { try { resolve({ status: res.statusCode || 0, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode || 0, body: d }); } }); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== UX AUDIT ===\n');

  const t = await prisma.tenant.findFirst({ where: { slug: 'test-tenant' } });
  const tenantId = t!.id;
  setTenantContext({ tenantId, tenantSlug: 'test-tenant' });
  const mgr = await prisma.user.findFirst({ where: { username: 'testmanager', tenantId } });
  token = generateAccessToken({ userId: mgr!.id, tenantId, tenantSlug: 'test-tenant' });

  const app = express(); app.use(express.json()); registerRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, () => { const a: any = server.address(); baseUrl = `http://localhost:${a.port}`; resolve(); }); });

  // Journey 1: Auth
  console.log('--- Journey 1: Auth ---');
  const r1 = await api('POST', '/api/v1/auth/login', { email: 'manager@test.com', password: 'manager123' });
  if (r1.status === 200 && r1.body?.data?.accessToken) pass('Login returns token'); else fail('Login', `Status ${r1.status}`);
  const tk = r1.body?.data?.accessToken || token;

  const r2 = await api('GET', '/api/v1/auth/me', undefined, tk);
  if (r2.status === 200 && r2.body?.data?.fullName) pass('Me returns user'); else fail('Get me', `Status ${r2.status}`);

  const r3 = await api('POST', '/api/v1/auth/login', { email: 'manager@test.com', password: 'wrongpass' });
  if (r3.status === 401) pass('Wrong password = 401'); else fail('Wrong password', `Status ${r3.status}`);

  // Journey 2: Settings
  console.log('\n--- Journey 2: Settings ---');
  const s1 = await api('GET', '/api/v1/settings/company');
  if (s1.status === 200) pass('Company settings loads'); else fail('Company settings', `Status ${s1.status}`);

  const s2 = await api('PUT', '/api/v1/settings/company', { company_name: 'UX Test Co', company_address: '123 Test St', company_phone: '042-1111111' });
  if (s2.status === 200) pass('Company settings saves'); else fail('Company save', `Status ${s2.status}`);

  const s3 = await api('GET', '/api/v1/settings/pos');
  if (s3.status === 200) pass('POS settings loads'); else fail('POS settings', `Status ${s3.status}`);

  const s4 = await api('GET', '/api/v1/settings/receipt');
  if (s4.status === 200) pass('Receipt settings loads'); else fail('Receipt settings', `Status ${s4.status}`);

  const s5 = await api('GET', '/api/v1/settings/email');
  if (s5.status === 200) pass('Email settings loads'); else fail('Email settings', `Status ${s5.status}`);

  // Journey 3: Products & Categories
  console.log('\n--- Journey 3: Products ---');
  let p1 = await api('POST', '/api/v1/product-categories', { name: 'UX Test Category' });
  let catId = p1.body?.data?.id;
  if (p1.status === 409) {
    // Category already exists — fetch its ID
    const cats = await api('GET', '/api/v1/product-categories?all=true');
    const existing = cats.body?.data?.find((c: any) => c.name === 'UX Test Category');
    catId = existing?.id;
    pass('Category (already exists)');
  } else if (p1.status === 201) pass('Category created');
  else fail('Category', `Status ${p1.status}`);

  const p2 = await api('GET', '/api/v1/product-categories');
  if (p2.status === 200 && p2.body?.data?.length > 0) pass('Categories list'); else fail('Categories', `Status ${p2.status}`);

  const p3b: any = { name: 'UX Test Product 1', sku: 'UX-PROD-1', costPrice: 500, sellingPrice: 1000 };
  if (catId) p3b.categoryId = Number(catId);
  const p3 = await api('POST', '/api/v1/products', p3b);
  if (p3.status === 201 || p3.status === 409) pass('Product 1 created/exists'); else fail('Product 1', `Status ${p3.status}`);

  const p4 = await api('POST', '/api/v1/products', { name: 'UX Test Product 2', sku: 'UX-PROD-2', costPrice: 300, sellingPrice: 600 });
  if (p4.status === 201 || p4.status === 409) pass('Product 2 created/exists'); else fail('Product 2', `Status ${p4.status}`);
  if (p4.status === 201) pass('Product 2 created'); else fail('Product 2', `Status ${p4.status}`);

  const p5 = await api('GET', '/api/v1/products');
  if (p5.status === 200 && p5.body?.data?.length >= 2) pass('Products list'); else fail('Products list', `Status ${p5.status}`);

  const p6 = await api('GET', '/api/v1/products/search?q=UX');
  if (p6.status === 200 && p6.body?.data?.length >= 2) pass('Product search works'); else fail('Product search', `Status ${p6.status}`);

  // Journey 4: Vendors & Purchases
  console.log('\n--- Journey 4: Vendors & Purchases ---');
  const v1 = await api('POST', '/api/v1/vendors', { companyName: 'UX Vendor', contactPerson: 'Test', email: 'ux@vendor.com' });
  if (v1.status === 201) pass('Vendor created'); else fail('Vendor', `Status ${v1.status}`);
  const vendorId = v1.body?.data?.id;

  const v2 = await api('GET', `/api/v1/vendors/${vendorId}`);
  if (v2.status === 200 && v2.body?.data?.companyName === 'UX Vendor') pass('Vendor detail'); else fail('Vendor detail', `Status ${v2.status}`);

  const po1 = await api('POST', '/api/v1/purchases/orders', { vendorId: Number(vendorId), orderDate: new Date().toISOString(), items: [{ productId: 105, quantityOrdered: 10, unitCost: 600 }] });
  if (po1.status === 201) pass('PO created'); else fail('PO', `Status ${po1.status}`);
  const poId = po1.body?.data?.id;

  const po2 = await api('GET', `/api/v1/purchases/orders/${poId}`);
  if (po2.status === 200 && po2.body?.data?.items?.length > 0) pass('PO detail'); else fail('PO detail', `Status ${po2.status}`);

  // Journey 5: POS
  console.log('\n--- Journey 5: POS ---');
  const ws = await prisma.warehouseStock.findFirst({ where: { tenantId, productId: BigInt(105) } });
  const stockBefore = ws ? Number(ws.quantity) : 0;

  const pos1 = await api('POST', '/api/v1/pos/checkout', { items: [{ productId: 105, quantity: 1, unitPrice: 1000, discountAmount: 0 }], payments: [{ method: 'CASH', amount: 1000 }], customerId: 14, discount: 0 });
  if (pos1.status === 201) pass('Cash sale'); else fail('Cash sale', `Status ${pos1.status}: ${JSON.stringify(pos1.body)}`);
  const saleId = pos1.body?.data?.saleId;

  const pos2 = await api('POST', '/api/v1/pos/checkout', { items: [{ productId: 105, quantity: 1, unitPrice: 1000, discountAmount: 0 }], payments: [{ method: 'CREDIT', amount: 1000 }], customerId: 15, discount: 0 });
  if (pos2.status === 201 && pos2.body?.data?.paymentStatus === 'UNPAID') pass('Credit sale'); else fail('Credit sale', `Status ${pos2.status}`);

  const pos3 = await api('POST', '/api/v1/pos/checkout', { items: [{ productId: 105, quantity: 1, unitPrice: 1000, discountAmount: 0 }], payments: [{ method: 'CASH', amount: 1000 }], customerId: 14, discount: 200 });
  if (pos3.status === 201) pass('Sale with discount'); else fail('Discounted sale', `Status ${pos3.status}`);

  const pos4 = await api('POST', '/api/v1/pos/hold', { items: [{ productId: 105, quantity: 2, unitPrice: 1000, lineTotal: 2000 }], customerId: 14 });
  if (pos4.status === 201) pass('Hold sale'); else fail('Hold sale', `Status ${pos4.status}`);
  const heldId = pos4.body?.data?.id;

  const pos5 = await api('GET', '/api/v1/pos/held-sales');
  if (pos5.status === 200 && pos5.body?.data?.length >= 0) pass('Held sales list'); else fail('Held sales', `Status ${pos5.status}`);

  if (heldId) {
    const pos6 = await api('POST', `/api/v1/pos/resume/${heldId}`, {});
    if (pos6.status === 200 && pos6.body?.data?.sale?.items?.length > 0) pass('Resume sale'); else fail('Resume', `Status ${pos6.status}`);
  }

  // Journey 6: Returns
  console.log('\n--- Journey 6: Returns ---');
  const saleItems = await prisma.saleItem.findMany({ where: { saleId: BigInt(pos1.body?.data?.saleId) }, take: 1 });
  const siId = saleItems[0]?.id?.toString() || '';

  const ret1 = await api('POST', '/api/v1/pos/process-return', { customerId: 15, items: [{ saleItemId: siId, quantity: 1, unitPrice: 1000, productId: 105 }], reason: 'defective', refundMethod: 'cash' });
  if (ret1.status === 201 && ret1.body?.data?.status === 'APPROVED') pass('POS return auto-approved'); else fail('POS return', `Status ${ret1.status}, status=${ret1.body?.data?.status}`);

  // Office return (PENDING)
  const ret2 = await api('POST', '/api/v1/sales-returns', { saleId: Number(saleId || '0'), reason: 'defective', items: [{ saleItemId: siId || '0', quantity: 1, unitPrice: 1000 }] });
  if (ret2.status === 201 && ret2.body?.data?.status === 'PENDING') pass('Office return PENDING'); else fail('Office return', `Status ${ret2.status}`);

  // Journey 7: Sales
  console.log('\n--- Journey 7: Sales ---');
  const sa1 = await api('GET', '/api/v1/sales');
  if (sa1.status === 200 && sa1.body?.data?.length >= 1) pass('Sales list'); else fail('Sales list', `Status ${sa1.status}`);

  if (saleId) {
    const sa2 = await api('GET', `/api/v1/sales/${saleId}`);
    if (sa2.status === 200 && sa2.body?.data?.items?.length > 0) pass('Sale detail'); else fail('Sale detail', `Status ${sa2.status}`);
  }

  const sa3 = await api('GET', '/api/v1/sales/stats');
  if (sa3.status === 200 && sa3.body?.data?.todaySales > 0) pass('Sales stats'); else fail('Sales stats', `Status ${sa3.status}`);

  // Journey 8: Customers
  console.log('\n--- Journey 8: Customers ---');
  const c1 = await api('POST', '/api/v1/customers', { fullName: 'UX Customer', email: 'ux@customer.com', phone: '0300-0000000', creditLimit: 50000 });
  if (c1.status === 201) pass('Customer created'); else fail('Customer', `Status ${c1.status}`);
  const custId = c1.body?.data?.id;

  const c2 = await api('GET', `/api/v1/customers/${custId}`);
  if (c2.status === 200 && c2.body?.data?.creditLimit === 50000) pass('Customer detail'); else fail('Customer detail', `Status ${c2.status}`);

  const c3 = await api('GET', `/api/v1/customers/${custId}/ledger`);
  if (c3.status === 200) pass('Customer ledger'); else fail('Customer ledger', `Status ${c3.status}`);

  // Journey 9: Accounting
  console.log('\n--- Journey 9: Accounting ---');
  const ac1 = await api('GET', '/api/v1/accounting');
  if (ac1.status === 200) pass('Accounting dashboard'); else fail('Accounting dashboard', `Status ${ac1.status}`);

  const ac2 = await api('GET', '/api/v1/accounting/chart-of-accounts');
  if (ac2.status === 200 && ac2.body?.data?.length >= 5) pass('Chart of accounts'); else fail('CoA', `Status ${ac2.status}`);

  const ac3 = await api('GET', '/api/v1/accounting/journal-entries');
  if (ac3.status === 200) pass('Journal entries'); else fail('Journal entries', `Status ${ac3.status}`);

  const ac4 = await api('GET', '/api/v1/accounting/trial-balance');
  if (ac4.status === 200) pass('Trial balance'); else fail('Trial balance', `Status ${ac4.status}`);

  const ac5 = await api('GET', '/api/v1/accounting/profit-loss');
  if (ac5.status === 200) pass('P&L'); else fail('P&L', `Status ${ac5.status}`);

  const ac6 = await api('GET', '/api/v1/accounting/balance-sheet');
  if (ac6.status === 200) pass('Balance sheet'); else fail('Balance sheet', `Status ${ac6.status}`);

  const ac7 = await api('GET', '/api/v1/accounting/general-ledger');
  if (ac7.status === 200 && ac7.body?.data?.accounts?.length >= 5) pass('General ledger'); else fail('GL', `Status ${ac7.status}`);

  // Journey 10: Reports
  console.log('\n--- Journey 10: Reports ---');
  for (const [name, url] of [['Sales', '/reports/sales'], ['Purchases', '/reports/purchases'], ['Inventory', '/reports/inventory'], ['Customer aging', '/reports/customer-aging'], ['Expenses', '/reports/expenses'], ['Vendors', '/reports/vendors']]) {
    const r = await api('GET', `/api/v1${url}`);
    if (r.status === 200) pass(`${name} report`); else fail(`${name} report`, `Status ${r.status}`);
  }

  // Journey 11: Users & RBAC
  console.log('\n--- Journey 11: Users & RBAC ---');
  const u1 = await api('GET', '/api/v1/users');
  if (u1.status === 200 && u1.body?.data?.length >= 1) pass('Users list'); else fail('Users', `Status ${u1.status}`);

  const u2 = await api('GET', '/api/v1/rbac/roles');
  if (u2.status === 200 && u2.body?.data?.length >= 1) pass('Roles list'); else fail('Roles', `Status ${u2.status}`);

  const u3 = await api('GET', '/api/v1/rbac/permissions');
  if (u3.status === 200) pass('Permissions'); else fail('Permissions', `Status ${u3.status}`);

  // Journey 12: Void
  console.log('\n--- Journey 12: Void ---');
  if (saleId) {
    const void1 = await api('PATCH', `/api/v1/sales/${saleId}/void`, { voidReason: 'UX test void' });
    if (void1.status === 200) pass('Void sale'); else fail('Void', `Status ${void1.status}`);
  }

  // Journey 13: Public receipt
  console.log('\n--- Journey 13: Public ---');
  if (saleId) {
    const pub1 = await new Promise<any>((resolve) => {
      const opts = { hostname: 'localhost', port: 0, path: `/api/v1/public/receipts/${saleId}`, method: 'GET', headers: {} };
      const u = new URL('http://localhost');
      const req = http.request({ hostname: 'localhost', port: new URL(baseUrl).port, path: `/api/v1/public/receipts/${saleId}`, method: 'GET', headers: {} }, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => { try { resolve({ status: res.statusCode || 0, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode || 0, body: {} }); } }); });
      req.on('error', () => resolve({ status: 0, body: {} }));
      req.end();
    });
    if (pub1.status === 200) pass('Public receipt without auth'); else fail('Public receipt', `Status ${pub1.status}`);
  }

  // Cleanup test data
  const tid = BigInt(tenantId);
  await prisma.product.deleteMany({ where: { tenantId: tid, name: { contains: 'UX' } } }).catch(() => {});
  await prisma.productCategory.deleteMany({ where: { tenantId, name: 'UX Test Category' } }).catch(() => {});
  await prisma.vendor.deleteMany({ where: { tenantId, companyName: 'UX Vendor' } }).catch(() => {});
  await prisma.customer.deleteMany({ where: { tenantId, fullName: 'UX Customer' } }).catch(() => {});

  // Summary
  console.log(`\n=== UX AUDIT RESULTS ===`);
  console.log(`Passed: ${passed}/${passed + failed}`);
  if (issues.length > 0) { console.log('Issues:'); for (const i of issues) console.log(`  - ${i}`); }
  console.log('');

  server.close();
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('UX AUDIT FAILED:', e); process.exit(1); });
