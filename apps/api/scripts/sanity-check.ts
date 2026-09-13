import { PrismaClient } from '@prisma/client';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../src/routes';
import { generateAccessToken } from '../src/utils/helpers';

const prisma = new PrismaClient();
let server: http.Server, baseUrl: string;
let tenantId: bigint;
let authToken = '';
let passed = 0, failed = 0;

function pass(m: string) { passed++; console.log(`  [PASS] ${m}`); }
function fail(m: string, r: string) { failed++; console.log(`  [FAIL] ${m} — ${r}`); }

async function api(method: string, path: string, body?: any) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts: http.RequestOptions = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` } };
    const req = http.request(opts, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => { try { resolve({ status: res.statusCode || 0, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode || 0, body: {} }); } }); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== SANITY CHECK ===\n');

  const t = await prisma.tenant.findFirst({ where: { slug: 'test-tenant' } });
  tenantId = t!.id;
  const mgr = await prisma.user.findFirst({ where: { username: 'testmanager', tenantId } });
  const wh = await prisma.warehouse.findFirst({ where: { tenantId, isDefault: true } }) || await prisma.warehouse.findFirst({ where: { tenantId } });
  const whId = wh!.id;
  authToken = generateAccessToken({ userId: mgr!.id, tenantId, tenantSlug: 'test-tenant' });

  const app = express(); app.use(express.json()); registerRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => { const a: any = server.address(); baseUrl = `http://localhost:${a.port}`; resolve(); });
  });
  console.log(`Server on ${baseUrl}\n`);

  // Create vendor
  const vRes = await api('POST', '/api/v1/vendors', { companyName: 'Sanity Vendor', contactPerson: 'Test', email: 'sanity@test.com' });
  if (vRes.status !== 201) { fail('Create vendor', String(vRes.status)); cleanup(); return; }
  const vendorId = vRes.body.data.id;
  pass('Vendor created');

  // Create PO
  const productA = await prisma.product.findFirst({ where: { sku: 'TST-PRODA', tenantId } });
  const poRes = await api('POST', '/api/v1/purchases/orders', { vendorId: Number(vendorId), orderDate: new Date().toISOString(), items: [{ productId: Number(productA!.id), quantityOrdered: 10, unitCost: 600 }] });
  if (poRes.status !== 201) { fail('Create PO', String(poRes.status)); cleanup(); return; }
  const poId = poRes.body.data.id;
  pass('PO created');

  // Get PO items
  const poDet = await api('GET', `/api/v1/purchases/orders/${poId}`);
  if (poDet.status !== 200) { fail('Get PO detail', `Status ${poDet.status}`); console.log(JSON.stringify(poDet.body)); cleanup(); return; }
  const poiId = poDet.body.data?.items?.[0]?.id;
  if (!poiId) { fail('Get PO items', 'No items in response'); console.log(JSON.stringify(poDet.body).slice(0, 500)); cleanup(); return; }
  pass('PO detail loaded with items');

  // Stock before
  const stockBefore = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productA!.id } });
  const beforeQty = stockBefore ? Number(stockBefore.quantity) : 0;

  // Create GRN
  const grnRes = await api('POST', '/api/v1/purchases/receipts', {
    purchaseOrderId: Number(poId), items: [{ purchaseOrderItemId: Number(poiId), productId: Number(productA!.id), quantityReceived: 5, unitCost: 600, warehouseId: Number(whId) }],
  });
  if (grnRes.status !== 201) { fail('Create GRN', `Status ${grnRes.status} — ${JSON.stringify(grnRes.body)}`); cleanup(); return; }
  pass('GRN created');

  const stockAfter = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productA!.id } });
  const afterQty = stockAfter ? Number(stockAfter.quantity) : 0;
  if (afterQty === beforeQty + 5) pass(`Stock increased: ${beforeQty} → ${afterQty}`);
  else fail('Stock change', `Expected ${beforeQty + 5}, got ${afterQty}`);

  // Stock movement
  const movements = await prisma.stockMovement.findMany({ where: { tenantId, movementType: 'PURCHASE_IN', productId: productA!.id }, orderBy: { createdAt: 'desc' }, take: 1 });
  if (movements.length > 0) pass('PURCHASE_IN movement created');
  else fail('Movement type', 'No PURCHASE_IN');

  // Journal entry
  const journals = await prisma.journalEntry.findMany({ where: { tenantId, description: { contains: 'GRN-' } }, include: { lines: true } });
  if (journals.length > 0 && journals.some(j => j.lines.some(l => Number(l.debitAmount) > 0 && Number(l.creditAmount) === 0))) pass('Journal Dr Inventory exists');
  else fail('Journal entry', 'Missing Dr Inventory entry');

  // Vendor balance
  const vRes2 = await api('GET', `/api/v1/vendors/${vendorId}`);
  if (vRes2.body.data?.currentBalance > 0) pass(`Vendor balance after GRN: ${vRes2.body.data.currentBalance}`);
  else fail('Vendor balance after GRN', `Expected > 0, got ${vRes2.body.data?.currentBalance}`);

  // Vendor payment
  const payRes = await api('POST', `/api/v1/vendors/${vendorId}/payments`, { amount: 2000, paymentMethod: 'CASH' });
  if (payRes.status === 201) {
    pass('Vendor payment recorded');
    const vRes3 = await api('GET', `/api/v1/vendors/${vendorId}`);
    if (vRes3.body.data?.currentBalance < vRes2.body.data?.currentBalance) pass('Vendor balance decreased after payment');
    else fail('Vendor balance after payment', `Was ${vRes2.body.data?.currentBalance}, now ${vRes3.body.data?.currentBalance}`);
  } else fail('Vendor payment', `Status ${payRes.status}`);

  // Vendor ledger
  const ledRes = await api('GET', `/api/v1/vendors/${vendorId}/ledger`);
  if (ledRes.body.data?.length > 0 && ledRes.body.data.every((e: any) => e.balanceBefore !== undefined)) pass('Vendor ledger has balanceBefore/After');
  else fail('Vendor ledger', 'Missing balance fields');

  // Stock adjustment
  const adjRes = await api('POST', '/api/v1/inventory/adjustments', {
    warehouseId: Number(whId), reason: 'Test', items: [{ productId: Number(productA!.id), quantityBefore: afterQty, quantityAfter: afterQty - 2, reason: 'Damage' }],
  });
  if (adjRes.status === 201) {
    pass('Adjustment created');
    const adjId = adjRes.body.data.ids[0];
    const appRes = await api('PATCH', `/api/v1/inventory/adjustments/${adjId}/approve`, {});
    if (appRes.status === 200) {
      pass('Adjustment approved');
      const stockAdj = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productA!.id } });
      if (stockAdj && Number(stockAdj.quantity) === afterQty - 2) pass('Stock decreased after adjustment');
      else fail('Stock after adjustment', `Expected ${afterQty - 2}, got ${Number(stockAdj?.quantity || 0)}`);
    } else fail('Approve adjustment', `Status ${appRes.status}`);
  } else fail('Create adjustment', `Status ${adjRes.status}`);

  // Cleanup
  cleanup();

  const total = passed + failed;
  console.log(`\n=== RESULT: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''} ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup() {
  server?.close();
  await prisma.vendor.deleteMany({ where: { tenantId, companyName: 'Sanity Vendor' } }).catch(() => {});
  await prisma.purchaseOrder.deleteMany({ where: { tenantId, orderNumber: { contains: 'PO-' } } }).catch(() => {});
  await prisma.purchaseReceipt.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.purchaseReturn.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.stockMovement.deleteMany({ where: { tenantId, movementType: { in: ['PURCHASE_IN', 'PURCHASE_RETURN', 'ADJUSTMENT'] } } }).catch(() => {});
  await prisma.stockBatch.deleteMany({ where: { tenantId, batchNumber: { contains: 'PO-' } } }).catch(() => {});
  await prisma.journalEntry.deleteMany({ where: { tenantId, entryNumber: { contains: 'GRN-' } } }).catch(() => {});
  await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { tenantId, entryNumber: { contains: 'GRN-' } } } }).catch(() => {});
  await prisma.stockAdjustment.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.vendorLedger.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.$disconnect();
}

main().catch((e) => { console.error('SANITY FAILED:', e.message); cleanup(); });
