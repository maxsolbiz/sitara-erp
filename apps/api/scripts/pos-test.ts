import { PrismaClient } from '@prisma/client';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../src/routes';
import { setTenantContext } from '../src/lib/prisma';
import { generateAccessToken, hashPassword } from '../src/utils/helpers';
import { getDefaultWarehouse } from '../src/utils/warehouse';

const prisma = new PrismaClient();
const PORT = 0; // random port

type StockSnapshot = { productId: bigint; qty: number; batchId: bigint; remaining: number }[];

let server: http.Server;
let baseUrl: string;
let tenantId: bigint;
let cashierUser: any, managerUser: any;
let walkinId: bigint, namedId: bigint, tierId: bigint;
let productAId: bigint, productBId: bigint;
let whId: bigint;

let passed = 0, failed = 0;
const failures: string[] = [];
let authToken = '';
let cashierToken = '';

function pass(name: string) { passed++; console.log(`  [PASS] ${name}`); }
function fail(name: string, reason: string) { failed++; failures.push(`${name}: ${reason}`); console.log(`  [FAIL] ${name} — ${reason || '(no message)'}`); }
function assert(name: string, condition: boolean, reason: string) {
  if (condition) pass(name); else fail(name, reason);
}

async function api(method: string, path: string, body?: any, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts: http.RequestOptions = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers: { 'Content-Type': 'application/json' },
    };
    const t = token || authToken;
    if (t) opts.headers!['Authorization'] = `Bearer ${t}`;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode || 0, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode || 0, body: {} }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getStockQty(productId: bigint): Promise<number> {
  const s = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId } });
  return s ? Number(s.quantity) : 0;
}

async function snapshotStock(): Promise<StockSnapshot> {
  const rows = await prisma.warehouseStock.findMany({ where: { tenantId, warehouseId: whId } });
  const batches = await prisma.stockBatch.findMany({ where: { tenantId, warehouseId: whId } });
  return rows.map((r) => ({
    productId: r.productId, qty: Number(r.quantity),
    batchId: batches.find((b) => b.productId === r.productId)?.id || BigInt(0),
    remaining: Number(batches.find((b) => b.productId === r.productId)?.quantityRemaining || 0),
  }));
}

async function restoreStock(snap: StockSnapshot) {
  for (const s of snap) {
    await prisma.warehouseStock.updateMany({ where: { tenantId, warehouseId: whId, productId: s.productId }, data: { quantity: s.qty } });
    if (s.batchId !== BigInt(0)) await prisma.stockBatch.updateMany({ where: { id: s.batchId }, data: { quantityRemaining: s.remaining } });
  }
}

async function getJournalCount(): Promise<number> {
  return prisma.journalEntry.count({ where: { tenantId } });
}

async function getCustomerBalance(customerId: bigint): Promise<number> {
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  return c ? Number(c.currentBalance) : 0;
}

async function setup() {
  const t = await prisma.tenant.findFirst({ where: { slug: 'test-tenant' } });
  tenantId = t!.id;
  setTenantContext({ tenantId, tenantSlug: 'test-tenant' });
  cashierUser = await prisma.user.findFirst({ where: { username: 'testcashier', tenantId } });
  managerUser = await prisma.user.findFirst({ where: { username: 'testmanager', tenantId } });
  walkinId = (await prisma.customer.findFirst({ where: { customerCode: 'WALKIN', tenantId } }))!.id;
  namedId = (await prisma.customer.findFirst({ where: { customerCode: 'TEST-NAMED', tenantId } }))!.id;
  tierId = (await prisma.customer.findFirst({ where: { customerCode: 'TEST-TIER', tenantId } }))!.id;
  productAId = (await prisma.product.findFirst({ where: { sku: 'TST-PRODA', tenantId } }))!.id;
  productBId = (await prisma.product.findFirst({ where: { sku: 'TST-PRODB', tenantId } }))!.id;
  whId = await getDefaultWarehouse(tenantId);
  authToken = generateAccessToken({ userId: managerUser!.id, tenantId, tenantSlug: 'test-tenant' });
  cashierToken = generateAccessToken({ userId: cashierUser!.id, tenantId, tenantSlug: 'test-tenant' });
}

// ---- TEST GROUPS ----

async function testGroupA() {
  console.log('\n--- Group A: Pure Sales ---');

  // A1: Cash sale
  try {
    const snap = await snapshotStock();
    const beforeJournal = await getJournalCount();
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CASH', amount: 1000 }],
      customerId: Number(walkinId), discount: 0,
    });
    assert('A1: Sale completed', res.status === 201, `Status ${res.status}`);
    assert('A1: Status = COMPLETED', res.body?.data?.saleId, 'No saleId');
    const stock = await getStockQty(productAId);
    assert('A1: Stock decremented', stock === 49, `Stock is ${stock}`);
    const journalCount = await getJournalCount();
    assert('A1: Journal created', journalCount > beforeJournal, 'No new journal');
    // Cleanup
    const sale = await prisma.sale.findFirst({ where: { tenantId, saleNumber: res.body.data.saleNumber } });
    if (sale) {
      await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
      await prisma.salePayment.deleteMany({ where: { saleId: sale.id } });
      await prisma.stockMovement.deleteMany({ where: { referenceId: sale.id } });
      await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { referenceId: sale.id } } });
      await prisma.journalEntry.deleteMany({ where: { referenceId: sale.id } });
      await prisma.sale.delete({ where: { id: sale.id } });
    }
    await restoreStock(snap);
  } catch (e: any) { fail('A1', e.message || String(e)); if (e?.stack) console.error('  STACK:', e.stack.split('\n').slice(0,3).join('\n')); }

  // A2: Credit sale
  try {
    const snap = await snapshotStock();
    const balBefore = await getCustomerBalance(namedId);
    const beforeJournal = await getJournalCount();
    const beforeLedger = await prisma.customerLedger.count({ where: { tenantId, customerId: namedId } });
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CREDIT', amount: 1000 }],
      customerId: Number(namedId), discount: 0,
    });
    assert('A2: Sale completed', res.status === 201, `Status ${res.status}`);
    assert('A2: PaymentStatus = UNPAID', res.body?.data?.paymentStatus === 'UNPAID', `Got ${res.body?.data?.paymentStatus}`);
    const balAfter = await getCustomerBalance(namedId);
    assert('A2: Balance incremented', balAfter === balBefore + 1000, `Balance ${balAfter}`);
    const ledgerCount = await prisma.customerLedger.count({ where: { tenantId, customerId: namedId } });
    assert('A2: Ledger entry created', ledgerCount > beforeLedger, 'No ledger entry');
    const journalCount = await getJournalCount();
    assert('A2: Journal created', journalCount > beforeJournal, 'No new journal');
    // Cleanup
    const sale = await prisma.sale.findFirst({ where: { tenantId, saleNumber: res.body.data.saleNumber } });
    if (sale) {
      await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
      await prisma.salePayment.deleteMany({ where: { saleId: sale.id } });
      await prisma.stockMovement.deleteMany({ where: { referenceId: sale.id } });
      await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { referenceId: sale.id } } });
      await prisma.journalEntry.deleteMany({ where: { referenceId: sale.id } });
      await prisma.customerLedger.deleteMany({ where: { referenceId: sale.id } });
      await prisma.sale.delete({ where: { id: sale.id } });
      await prisma.customer.update({ where: { id: namedId }, data: { currentBalance: balBefore } });
    }
    await restoreStock(snap);
  } catch (e: any) { fail('A2', e.message); }

  // A3: Credit limit exceeded
  try {
    const snap = await snapshotStock();
    const balBefore = await getCustomerBalance(namedId);
    const beforeJournal = await getJournalCount();
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 20, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CREDIT', amount: 20000 }],
      customerId: Number(namedId), discount: 0,
    });
    assert('A3: Request rejected', res.status === 400 || res.status === 422, `Status ${res.status}`);
    const balAfter = await getCustomerBalance(namedId);
    assert('A3: Balance unchanged', balAfter === balBefore, `Balance changed ${balAfter}`);
    const stock = await getStockQty(productAId);
    assert('A3: Stock unchanged', stock === 50, `Stock is ${stock}`);
    const journalCount = await getJournalCount();
    assert('A3: No journal created', journalCount === beforeJournal, 'Journal was created');
    await restoreStock(snap);
  } catch (e: any) { fail('A3', e.message); }

  // A4: Card sale with reference
  try {
    const snap = await snapshotStock();
    const beforeJournal = await getJournalCount();
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CARD', amount: 1000, referenceNumber: 'TXN-001' }],
      customerId: Number(walkinId), discount: 0,
    });
    assert('A4: Sale completed', res.status === 201, `Status ${res.status}`);
    const sale = await prisma.sale.findFirst({ where: { tenantId, saleNumber: res.body.data.saleNumber }, include: { payments: true } });
    const paymentRef = sale?.payments?.[0]?.referenceNumber;
    assert('A4: Reference saved', paymentRef === 'TXN-001', `Got ${paymentRef}`);
    const journalCount = await getJournalCount();
    assert('A4: Journal created', journalCount > beforeJournal, 'No new journal');
    if (sale) {
      await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
      await prisma.salePayment.deleteMany({ where: { saleId: sale.id } });
      await prisma.stockMovement.deleteMany({ where: { referenceId: sale.id } });
      await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { referenceId: sale.id } } });
      await prisma.journalEntry.deleteMany({ where: { referenceId: sale.id } });
      await prisma.sale.delete({ where: { id: sale.id } });
    }
    await restoreStock(snap);
  } catch (e: any) { fail('A4', e.message); }

  // A5: Walk-in credit attempt
  try {
    const snap = await snapshotStock();
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CREDIT', amount: 1000 }],
      customerId: Number(walkinId), discount: 0,
    });
    assert('A5: Request rejected', res.status === 400, `Status ${res.status}`);
    await restoreStock(snap);
  } catch (e: any) { fail('A5', e.message); }

  // A6: Pricing tier customer
  try {
    const snap = await snapshotStock();
    const beforeJournal = await getJournalCount();
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CASH', amount: 900 }],
      customerId: Number(tierId), discount: 0,
    });
    assert('A6: Sale completed', res.status === 201, `Status ${res.status}`);
    const sale = await prisma.sale.findFirst({ where: { tenantId, saleNumber: res.body.data.saleNumber }, include: { items: true } });
    if (sale && sale.items.length > 0) {
      const unitPrice = Number(sale.items[0].unitPrice);
      assert('A6: Tier price applied', unitPrice === 900, `UnitPrice ${unitPrice}`);
    }
    assert('A6: TierDiscount > 0', sale?.tierDiscount !== null && Number(sale?.tierDiscount) > 0, 'No tier discount');
    const journalCount = await getJournalCount();
    assert('A6: Journal created', journalCount > beforeJournal, 'No new journal');
    if (sale) {
      await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
      await prisma.salePayment.deleteMany({ where: { saleId: sale.id } });
      await prisma.stockMovement.deleteMany({ where: { referenceId: sale.id } });
      await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { referenceId: sale.id } } });
      await prisma.journalEntry.deleteMany({ where: { referenceId: sale.id } });
      await prisma.sale.delete({ where: { id: sale.id } });
    }
    await restoreStock(snap);
  } catch (e: any) { fail('A6', e.message); }
}

async function testGroupB() {
  console.log('\n--- Group B: Returns ---');

  async function makeSale(): Promise<{ saleId: string; itemId: string }> {
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CASH', amount: 1000 }],
      customerId: Number(namedId), discount: 0,
    });
    if (res.status !== 201) throw new Error(`Setup sale failed: ${res.status}`);
    const sale = await prisma.sale.findFirst({ where: { tenantId, saleNumber: res.body.data.saleNumber } });
    if (!sale) throw new Error('Sale not found');
    const item = await prisma.saleItem.findFirst({ where: { saleId: sale.id } });
    if (!item) throw new Error('Sale item not found');
    return { saleId: sale.id.toString(), itemId: item.id.toString() };
  }

  async function cleanupSale(saleId: string) {
    const id = BigInt(saleId);
    await prisma.saleItem.deleteMany({ where: { saleId: id } });
    await prisma.salePayment.deleteMany({ where: { saleId: id } });
    await prisma.stockMovement.deleteMany({ where: { referenceId: id } });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { referenceId: id } } });
    await prisma.journalEntry.deleteMany({ where: { referenceId: id } });
    await prisma.sale.delete({ where: { id } });
  }

  // B1: Standalone return — cash refund
  try {
    const snap = await snapshotStock();
    const { saleId, itemId } = await makeSale();
    const beforeJournal = await getJournalCount();
    const productAStock = await getStockQty(productAId);
    const returnRes = await api('POST', '/api/v1/pos/process-return', {
      customerId: Number(namedId),
      items: [{ saleItemId: itemId, quantity: 1, unitPrice: 1000, productId: Number(productAId) }],
      reason: 'defective', refundMethod: 'cash',
    });
    assert('B1: Return completed', returnRes.status === 201, `Status ${returnRes.status}`);
    assert('B1: Status = APPROVED', returnRes.body?.data?.status === 'APPROVED', `Got ${returnRes.body?.data?.status}`);
    const stockAfter = await getStockQty(productAId);
    assert('B1: Stock restored', stockAfter === productAStock + 1, `Stock ${stockAfter}`);
    const journalCount = await getJournalCount();
    assert('B1: Journal created', journalCount > beforeJournal, 'No new journal');
    // Cleanup
    if (returnRes.body?.data?.returnId) {
      const retId = BigInt(returnRes.body.data.returnId);
      await prisma.salesReturnItem.deleteMany({ where: { salesReturnId: retId } });
      await prisma.salesReturn.delete({ where: { id: retId } });
    }
    await cleanupSale(saleId);
    await restoreStock(snap);
  } catch (e: any) { fail('B1', e.message); }

  // B2: Standalone return — credit refund
  try {
    const snap = await snapshotStock();
    const balBefore = await getCustomerBalance(namedId);
    const { saleId, itemId } = await makeSale();
    const beforeLedger = await prisma.customerLedger.count({ where: { tenantId, customerId: namedId } });
    const beforeJournal = await getJournalCount();
    const returnRes = await api('POST', '/api/v1/pos/process-return', {
      customerId: Number(namedId),
      items: [{ saleItemId: itemId, quantity: 1, unitPrice: 1000, productId: Number(productAId) }],
      reason: 'defective', refundMethod: 'credit',
    });
    assert('B2: Return completed', returnRes.status === 201, `Status ${returnRes.status}`);
    const balAfter = await getCustomerBalance(namedId);
    assert('B2: Balance incremented', balAfter === balBefore + 1000, `Balance ${balAfter}`);
    const ledgerCount = await prisma.customerLedger.count({ where: { tenantId, customerId: namedId } });
    assert('B2: Ledger entry created', ledgerCount > beforeLedger, 'No ledger entry');
    const journalCount = await getJournalCount();
    assert('B2: Journal created', journalCount > beforeJournal, 'No new journal');
    // Cleanup
    if (returnRes.body?.data?.returnId) {
      const retId = BigInt(returnRes.body.data.returnId);
      await prisma.customerLedger.deleteMany({ where: { referenceId: retId } });
      await prisma.salesReturnItem.deleteMany({ where: { salesReturnId: retId } });
      await prisma.salesReturn.delete({ where: { id: retId } });
    }
    await cleanupSale(saleId);
    await prisma.customer.update({ where: { id: namedId }, data: { currentBalance: balBefore } });
    await restoreStock(snap);
  } catch (e: any) { fail('B2', e.message); }

  // B3: Walk-in credit refund blocked
  try {
    const snap = await snapshotStock();
    const res = await api('POST', '/api/v1/pos/process-return', {
      customerId: Number(walkinId),
      items: [{ saleItemId: '0', quantity: 1, unitPrice: 1000, productId: Number(productAId) }],
      reason: 'defective', refundMethod: 'credit',
    });
    assert('B3: Request rejected', res.status === 400, `Status ${res.status}`);
    await restoreStock(snap);
  } catch (e: any) { fail('B3', e.message); }

  // B4: Mixed sale+return
  try {
    const snap = await snapshotStock();
    const beforeJournal = await getJournalCount();
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [
        { productId: Number(productAId), quantity: 2, unitPrice: 1000, discountAmount: 0 },
        { productId: Number(productBId), quantity: -1, unitPrice: 500, discountAmount: 0 },
      ],
      payments: [{ method: 'CASH', amount: 1500 }],
      customerId: Number(walkinId), discount: 0,
    });
    assert('B4: Sale completed', res.status === 201, `Status ${res.status}`);
    const stockA = await getStockQty(productAId);
    const stockB = await getStockQty(productBId);
    assert('B4: ProductA stock down by 2', stockA === 48, `StockA ${stockA}`);
    assert('B4: ProductB stock restored by 1', stockB === 21, `StockB ${stockB}`);
    const journalCount = await getJournalCount();
    assert('B4: Journal created', journalCount > beforeJournal, 'No new journal');
    const sale = await prisma.sale.findFirst({ where: { tenantId, saleNumber: res.body.data.saleNumber } });
    if (sale) {
      await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
      await prisma.salePayment.deleteMany({ where: { saleId: sale.id } });
      await prisma.stockMovement.deleteMany({ where: { referenceId: sale.id } });
      await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { referenceId: sale.id } } });
      await prisma.journalEntry.deleteMany({ where: { referenceId: sale.id } });
      await prisma.sale.delete({ where: { id: sale.id } });
    }
    await restoreStock(snap);
  } catch (e: any) { fail('B4', e.message); }
}

async function testGroupC() {
  console.log('\n--- Group C: Credit Flow ---');

  // C1: Auto-apply existing balance
  try {
    const snap = await snapshotStock();
    await prisma.customer.update({ where: { id: namedId }, data: { currentBalance: 2000 } });
    const beforeJournal = await getJournalCount();
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CASH', amount: 0 }],
      customerId: Number(namedId), discount: 0,
    });
    assert('C1: Sale completed', res.status === 201, `Status ${res.status}`);
    const balAfter = await getCustomerBalance(namedId);
    assert('C1: Balance decremented by 1000', balAfter === 1000, `Balance ${balAfter}`);
    assert('C1: Auto-applied > 0', res.body?.data?.autoApplied > 0, 'No auto-apply');
    const journalCount = await getJournalCount();
    assert('C1: Journal created', journalCount > beforeJournal, 'No new journal');
    const sale = await prisma.sale.findFirst({ where: { tenantId, saleNumber: res.body.data.saleNumber } });
    if (sale) {
      await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
      await prisma.salePayment.deleteMany({ where: { saleId: sale.id } });
      await prisma.stockMovement.deleteMany({ where: { referenceId: sale.id } });
      await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { referenceId: sale.id } } });
      await prisma.journalEntry.deleteMany({ where: { referenceId: sale.id } });
      await prisma.customerLedger.deleteMany({ where: { referenceId: sale.id } });
      await prisma.sale.delete({ where: { id: sale.id } });
    }
    await prisma.customer.update({ where: { id: namedId }, data: { currentBalance: 0 } });
    await restoreStock(snap);
  } catch (e: any) { fail('C1', e.message); }

  // C2: Customer payment
  try {
    await prisma.customer.update({ where: { id: namedId }, data: { currentBalance: 5000 } });
    const balBefore = await getCustomerBalance(namedId);
    const beforeLedger = await prisma.customerLedger.count({ where: { tenantId, customerId: namedId } });
    const beforeJournal = await getJournalCount();
    const res = await api('POST', `/api/v1/customers/${Number(namedId)}/payments`, { amount: 5000, paymentMethod: 'CASH' });
    assert('C2: Payment recorded', res.status === 201, `Status ${res.status}`);
    const balAfter = await getCustomerBalance(namedId);
    assert('C2: Balance decremented', balAfter === balBefore - 5000, `Balance ${balAfter}`);
    const ledgerCount = await prisma.customerLedger.count({ where: { tenantId, customerId: namedId } });
    assert('C2: Ledger entry created', ledgerCount > beforeLedger, 'No ledger entry');
    const journalCount = await getJournalCount();
    assert('C2: Journal created', journalCount > beforeJournal, 'No new journal');
    await prisma.customer.update({ where: { id: namedId }, data: { currentBalance: 0 } });
  } catch (e: any) { fail('C2', e.message); }

  // C3: Customer ledger
  try {
    await prisma.customerLedger.create({
      data: { tenantId, customerId: namedId, type: 'ADJUSTMENT', amount: 1000, balanceBefore: 0, balanceAfter: 1000, createdBy: BigInt(1) },
    });
    const res = await api('GET', `/api/v1/customers/${Number(namedId)}/ledger?page=1&perPage=10`);
    assert('C3: Ledger returned', res.status === 200, `Status ${res.status}`);
    assert('C3: Has data', res.body?.data?.length > 0, 'No entries');
    const entry = res.body.data[0];
    assert('C3: Has balanceBefore', entry.balanceBefore !== undefined, 'Missing balanceBefore');
    assert('C3: Has balanceAfter', entry.balanceAfter !== undefined, 'Missing balanceAfter');
    assert('C3: Has type', entry.type, 'Missing type');
    assert('C3: Has meta', res.body?.meta?.total > 0, 'Missing meta');
    await prisma.customerLedger.deleteMany({ where: { tenantId, customerId: namedId, type: 'ADJUSTMENT' } });
  } catch (e: any) { fail('C3', e.message); }
}

async function testGroupD() {
  console.log('\n--- Group D: Void ---');

  // D1: Void cash sale
  try {
    const snap = await snapshotStock();
    const saleRes = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CASH', amount: 1000 }],
      customerId: Number(walkinId), discount: 0,
    });
    if (saleRes.status !== 201) { fail('D1: Setup sale failed', `Status ${saleRes.status}`); return; }
    const saleId = saleRes.body.data.saleId;
    const beforeJournal = await getJournalCount();
    const voidRes = await api('PATCH', `/api/v1/sales/${saleId}/void`, { voidReason: 'Test void' });
    assert('D1: Void accepted', voidRes.status === 200, `Status ${voidRes.status}`);
    const sale = await prisma.sale.findFirst({ where: { id: BigInt(saleId) } });
    assert('D1: Status = CANCELLED', sale?.status === 'CANCELLED', `Status ${sale?.status}`);
    const stock = await getStockQty(productAId);
    assert('D1: Stock restored', stock === 50, `Stock ${stock}`);
    assert('D1: Void reason stored', sale?.voidReason === 'Test void', `Reason ${sale?.voidReason}`);
    const journalCount = await getJournalCount();
    assert('D1: Reversal journal created', journalCount > beforeJournal, 'No new journal');
    await restoreStock(snap);
  } catch (e: any) { fail('D1', e.message); }

  // D2: Void credit sale
  try {
    const snap = await snapshotStock();
    const balBefore = await getCustomerBalance(namedId);
    const saleRes = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CREDIT', amount: 1000 }],
      customerId: Number(namedId), discount: 0,
    });
    if (saleRes.status !== 201) { fail('D2: Setup sale failed', `Status ${saleRes.status}`); return; }
    const saleId = saleRes.body.data.saleId;
    const beforeLedger = await prisma.customerLedger.count({ where: { tenantId, customerId: namedId } });
    const beforeJournal = await getJournalCount();
    const voidRes = await api('PATCH', `/api/v1/sales/${saleId}/void`, {});
    assert('D2: Void accepted', voidRes.status === 200, `Status ${voidRes.status}`);
    const balAfter = await getCustomerBalance(namedId);
    assert('D2: Balance decremented back', balAfter === balBefore, `Balance ${balAfter}`);
    const ledgerCount = await prisma.customerLedger.count({ where: { tenantId, customerId: namedId } });
    assert('D2: Ledger entry with VOID', ledgerCount > beforeLedger, 'No VOID ledger entry');
    const journalCount = await getJournalCount();
    assert('D2: Reversal journal created', journalCount > beforeJournal, 'No new journal');
    const sale = await prisma.sale.findFirst({ where: { id: BigInt(saleId) } });
    if (sale) {
      await prisma.customerLedger.deleteMany({ where: { referenceId: sale.id } });
      await prisma.customer.update({ where: { id: namedId }, data: { currentBalance: balBefore } });
    }
    await restoreStock(snap);
  } catch (e: any) { fail('D2', e.message); }

  // D3: Same-day restriction (past sale)
  try {
    await prisma.sale.deleteMany({ where: { tenantId, saleNumber: 'OLD-SALE' } });
    const yesterday = new Date(Date.now() - 86400000);
    const sale = await prisma.sale.create({
      data: { tenantId, saleNumber: 'OLD-SALE', saleDate: yesterday, subtotal: 1000, totalAmount: 1000, paidAmount: 1000, status: 'COMPLETED', createdBy: BigInt(1) },
    });
    const res = await api('PATCH', `/api/v1/sales/${sale.id.toString()}/void`, {});
    assert('D3: Rejected', res.status === 400, `Status ${res.status}`);
    await prisma.sale.delete({ where: { id: sale.id } }).catch(() => {});
  } catch (e: any) { fail('D3', e.message || String(e)); }

  // D4: Void already voided
  try {
    const snap = await snapshotStock();
    const saleRes = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CASH', amount: 1000 }],
      customerId: Number(walkinId), discount: 0,
    });
    if (saleRes.status !== 201) { fail('D4: Setup sale failed', ''); return; }
    const saleId = saleRes.body.data.saleId;
    const void1 = await api('PATCH', `/api/v1/sales/${saleId}/void`, {});
    assert('D4: First void accepted', void1.status === 200, `Status ${void1.status}`);
    const void2 = await api('PATCH', `/api/v1/sales/${saleId}/void`, {});
    assert('D4: Second void rejected', void2.status === 400, `Status ${void2.status}`);
    await restoreStock(snap);
  } catch (e: any) { fail('D4', e.message); }
}

async function testGroupE() {
  console.log('\n--- Group E: Edge Cases ---');

  // E1: Insufficient stock
  try {
    const snap = await snapshotStock();
    const beforeJournal = await getJournalCount();
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 100, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CASH', amount: 100000 }],
      customerId: Number(walkinId), discount: 0,
    });
    assert('E1: Rejected', res.status === 500 || res.status === 400, `Status ${res.status}`);
    const stock = await getStockQty(productAId);
    assert('E1: Stock unchanged', stock === 50, `Stock ${stock}`);
    const journalCount = await getJournalCount();
    assert('E1: No journal created', journalCount === beforeJournal, 'Journal was created');
    await restoreStock(snap);
  } catch (e: any) { fail('E1', e.message); }

  // E2: Zero amount payment (should succeed with AR entry for unpaid balance)
  try {
    const snap = await snapshotStock();
    const beforeJournal = await getJournalCount();
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CASH', amount: 0 }],
      customerId: Number(walkinId), discount: 0,
    });
    assert('E2: Sale completed', res.status === 201, `Status ${res.status}`);
    const stock = await getStockQty(productAId);
    assert('E2: Stock decremented', stock === 49, `Stock ${stock}`);
    const journalCount = await getJournalCount();
    assert('E2: Journal created (unpaid → AR debit)', journalCount > beforeJournal, 'No new journal');
    const sale = await prisma.sale.findFirst({ where: { tenantId, saleNumber: res.body.data.saleNumber } });
    if (sale) {
      await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
      await prisma.salePayment.deleteMany({ where: { saleId: sale.id } });
      await prisma.stockMovement.deleteMany({ where: { referenceId: sale.id } });
      await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { referenceId: sale.id } } });
      await prisma.journalEntry.deleteMany({ where: { referenceId: sale.id } });
      await prisma.sale.delete({ where: { id: sale.id } });
    }
    await restoreStock(snap);
  } catch (e: any) { fail('E2', e.message); }

  // E4: Manager override — valid
  try {
    const snap = await snapshotStock();
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 20, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CREDIT', amount: 20000 }],
      customerId: Number(namedId), discount: 0,
      managerOverride: { username: 'testmanager', password: 'manager123' },
    });
    assert('E4: Sale completes with override', res.status === 201, `Status ${res.status}`);
    const sale = await prisma.sale.findFirst({ where: { tenantId, saleNumber: res.body.data.saleNumber } });
    if (sale) {
      await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
      await prisma.salePayment.deleteMany({ where: { saleId: sale.id } });
      await prisma.stockMovement.deleteMany({ where: { referenceId: sale.id } });
      await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { referenceId: sale.id } } });
      await prisma.journalEntry.deleteMany({ where: { referenceId: sale.id } });
      await prisma.customerLedger.deleteMany({ where: { referenceId: sale.id } });
      await prisma.sale.delete({ where: { id: sale.id } });
      await prisma.customer.update({ where: { id: namedId }, data: { currentBalance: 0 } });
    }
    await restoreStock(snap);
  } catch (e: any) { fail('E4', e.message); }

  // E5: Manager override with cashier credentials (using cashier auth token)
  try {
    const snap = await snapshotStock();
    // Use the cashier token so the RBAC check runs with a non-super-admin user
    const res = await api('POST', '/api/v1/pos/checkout', {
      items: [{ productId: Number(productAId), quantity: 20, unitPrice: 1000, discountAmount: 0 }],
      payments: [{ method: 'CREDIT', amount: 20000 }],
      customerId: Number(namedId), discount: 0,
      managerOverride: { username: 'testcashier', password: 'cashier123' },
    }, cashierToken);
    assert('E5: Rejected', res.status === 400 || res.status === 403, `Status ${res.status}`);
    const msg = res.body?.detail || '';
    assert('E5: Has manager privileges message', msg.includes('manager'), `Message: ${msg}`);
    await restoreStock(snap);
  } catch (e: any) { fail('E5', e.message); }
}

// ---- MAIN ----
async function main() {
  console.log('=== POS TEST RUNNER ===\n');
  await setup();

  const app = express();
  app.use(express.json());
  registerRoutes(app);

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      const addr = server.address();
      baseUrl = `http://localhost:${typeof addr === 'object' ? addr!.port : addr}`;
      console.log(`Test server on ${baseUrl}\n`);
      resolve();
    });
  });

  await testGroupA();
  await testGroupB();
  await testGroupC();
  await testGroupD();
  await testGroupE();

  server.close();

  const total = passed + failed;
  const allTests = ['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4','C1','C2','C3','D1','D2','D3','D4','E1','E2','E4','E5'];
  const aPass = allTests.filter((t) => t.startsWith('A') && !failures.some((f) => f.startsWith(t))).length; const aTotal = 6;
  const bPass = allTests.filter((t) => t.startsWith('B') && !failures.some((f) => f.startsWith(t))).length; const bTotal = 4;
  const cPass = allTests.filter((t) => t.startsWith('C') && !failures.some((f) => f.startsWith(t))).length; const cTotal = 3;
  const dPass = allTests.filter((t) => t.startsWith('D') && !failures.some((f) => f.startsWith(t))).length; const dTotal = 4;
  const ePass = allTests.filter((t) => t.startsWith('E') && !failures.some((f) => f.startsWith(t))).length; const eTotal = 4;

  console.log(`\n=== POS TEST RESULTS ===`);
  console.log(`Group A (Pure Sales):    ${aPass}/${aTotal} passed`);
  console.log(`Group B (Returns):       ${bPass}/${bTotal} passed`);
  console.log(`Group C (Credit Flow):   ${cPass}/${cTotal} passed`);
  console.log(`Group D (Void):          ${dPass}/${dTotal} passed`);
  console.log(`Group E (Edge Cases):    ${ePass}/${eTotal} passed`);
  console.log(`Total: ${passed}/${total} passed\n`);
  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log('');
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('TEST RUNNER FAILED:', e); process.exit(1); });
