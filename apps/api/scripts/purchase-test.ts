import { prisma, setup, teardown, api, pass, fail, hasFailures, tenantId, productAId, vendorAId, whId } from './test-util';

async function main() {
  await setup(); console.log('\n=== Purchase Tests ===\n');
  let poId = '', poiId = '', receiptId = '';

  // A1-A3: Purchase Orders
  try {
    const r = await api('POST', '/api/v1/purchases/orders', { vendorId: Number(vendorAId), orderDate: new Date().toISOString(), items: [{ productId: Number(productAId), quantityOrdered: 10, unitCost: 600 }] });
    if (r.status === 201) { pass('A1: PO created'); poId = r.body?.data?.id; } else fail('A1', `Status ${r.status}`);
  } catch (e: any) { fail('A1', e.message); }
  try {
    const r = await api('GET', `/api/v1/purchases/orders/${poId}`);
    if (r.status === 200 && r.body?.data?.items?.length > 0) { pass('A2: PO detail'); poiId = r.body.data.items[0].id; } else fail('A2', `Status ${r.status}`);
  } catch (e: any) { fail('A2', e.message); }
  try { const r = await api('GET', '/api/v1/purchases/orders'); if (r.status === 200 && r.body?.data?.length >= 0) pass('A3: PO list'); else fail('A3', `Status ${r.status}`); } catch (e: any) { fail('A3', e.message); }

  // B1-B4: GRN
  let stockBefore = 0;
  try {
    const ws = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productAId } });
    stockBefore = ws ? Number(ws.quantity) : 0;
    const r = await api('POST', '/api/v1/purchases/receipts', { purchaseOrderId: Number(poId), items: [{ purchaseOrderItemId: Number(poiId), productId: Number(productAId), quantityReceived: 5, unitCost: 600, warehouseId: Number(whId) }] });
    if (r.status === 201) { pass('B1: GRN created'); receiptId = r.body?.data?.id; } else fail('B1', `Status ${r.status}: ${JSON.stringify(r.body)}`);
    const ws2 = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productAId } });
    if (ws2 && Number(ws2.quantity) === stockBefore + 5) pass('B1: Stock +5'); else fail('B1: Stock', `Expected ${stockBefore + 5}, got ${ws2?.quantity}`);
    const mv = await prisma.stockMovement.findFirst({ where: { tenantId, movementType: 'PURCHASE_IN', productId: productAId }, orderBy: { createdAt: 'desc' } });
    if (mv) pass('B1: PURCHASE_IN'); else fail('B1: Movement', 'Not found');
    const jn = await prisma.journalEntry.findFirst({ where: { tenantId, description: { contains: 'GRN' } }, orderBy: { createdAt: 'desc' } });
    if (jn) pass('B1: Journal created'); else fail('B1: Journal', 'Not found');
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorAId } });
    if (vendor && Number(vendor.currentBalance) > 0) pass('B1: Vendor balance +'); else fail('B1: Vendor balance', `Got ${vendor?.currentBalance}`);
  } catch (e: any) { fail('B1', e.message); }

  // B2: Partial GRN — check PO status
  try { const r = await api('GET', `/api/v1/purchases/orders/${poId}`); if (r.body?.data?.status === 'PARTIAL') pass('B2: Partial status'); else fail('B2', `Status ${r.body?.data?.status}`); } catch (e: any) { fail('B2', e.message); }

  // B3: Full GRN
  try {
    const r = await api('POST', '/api/v1/purchases/receipts', { purchaseOrderId: Number(poId), items: [{ purchaseOrderItemId: Number(poiId), productId: Number(productAId), quantityReceived: 5, unitCost: 600, warehouseId: Number(whId) }] });
    if (r.status === 201) pass('B3: Full GRN'); else fail('B3', `Status ${r.status}`);
    const po = await api('GET', `/api/v1/purchases/orders/${poId}`);
    if (po.body?.data?.status === 'RECEIVED') pass('B3: PO RECEIVED'); else fail('B3: PO status', `Got ${po.body?.data?.status}`);
  } catch (e: any) { fail('B3', e.message); }

  // Cleanup stock before returning test
  await prisma.warehouseStock.updateMany({ where: { tenantId, warehouseId: whId, productId: productAId }, data: { quantity: stockBefore } }).catch(() => {});

  // C1: Purchase Return
  try {
    const r = await api('POST', '/api/v1/purchases/returns', { vendorId: Number(vendorAId), reason: 'defective', items: [{ productId: Number(productAId), quantityReturned: 2, unitCost: 600, warehouseId: Number(whId) }] });
    if (r.status === 201) pass('C1: Return created'); else fail('C1', `Status ${r.status}`);
    const ws = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productAId } });
    if (ws && Number(ws.quantity) === stockBefore - 2) pass('C1: Stock -2'); else fail('C1: Stock', `Expected ${stockBefore - 2}, got ${ws?.quantity}`);
    const jn = await prisma.journalEntry.findFirst({ where: { tenantId, description: { contains: 'Purchase return' } }, orderBy: { createdAt: 'desc' } });
    if (jn) pass('C1: Journal'); else fail('C1: Journal', 'Not found');
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorAId } });
    if (vendor && Number(vendor.currentBalance) > 0) pass('C1: Vendor balance changed'); else fail('C1: Vendor balance', 'Zero');
  } catch (e: any) { fail('C1', e.message); }
  await prisma.warehouseStock.updateMany({ where: { tenantId, warehouseId: whId, productId: productAId }, data: { quantity: stockBefore } }).catch(() => {});

  // D1-D3: Vendor Payments
  let vendorBalBefore = 0;
  try {
    // Give vendor some balance first via a receipt
    await prisma.vendor.update({ where: { id: vendorAId }, data: { currentBalance: 5000 } });
    vendorBalBefore = 5000;
    const r = await api('POST', `/api/v1/vendors/${Number(vendorAId)}/payments`, { amount: 3000, paymentMethod: 'CASH' });
    if (r.status === 201) pass('D1: Payment'); else fail('D1', `Status ${r.status}`);
    const v = await prisma.vendor.findFirst({ where: { id: vendorAId } });
    if (v && Number(v.currentBalance) === 2000) pass('D1: Balance 2000'); else fail('D1: Balance', `Got ${v?.currentBalance}`);
    const je = await prisma.journalEntry.findFirst({ where: { tenantId, description: { contains: 'Payment to' } }, orderBy: { createdAt: 'desc' } });
    if (je) pass('D1: Journal'); else fail('D1: Journal', 'Not found');
    const vl = await prisma.vendorLedger.findFirst({ where: { tenantId, vendorId: vendorAId, type: 'PAYMENT' } });
    if (vl) pass('D1: Ledger PAYMENT'); else fail('D1: Ledger', 'Not found');
  } catch (e: any) { fail('D1', e.message); }
  await prisma.vendor.update({ where: { id: vendorAId }, data: { currentBalance: 0 } }).catch(() => {});

  try { const r = await api('GET', `/api/v1/vendors/${Number(vendorAId)}/ledger`); if (r.body?.data?.length > 0 && r.body.data.every((e: any) => e.balanceBefore !== undefined)) pass('D2: Ledger'); else fail('D2', 'Missing fields'); } catch (e: any) { fail('D2', e.message); }
  try { const r = await api('GET', `/api/v1/vendors/${Number(vendorAId)}/statement`); if (r.body?.data?.vendorName && r.body?.data?.entries) pass('D3: Statement'); else fail('D3', 'Missing fields'); } catch (e: any) { fail('D3', e.message); }

  // Cleanup
  await prisma.purchaseOrder.deleteMany({ where: { tenantId, vendorId: vendorAId } }).catch(() => {});
  await prisma.purchaseReceipt.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.purchaseReturn.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.stockMovement.deleteMany({ where: { tenantId, movementType: { in: ['PURCHASE_IN', 'PURCHASE_RETURN'] } } }).catch(() => {});
  await prisma.stockBatch.deleteMany({ where: { tenantId, batchNumber: { contains: 'PO-' } } }).catch(() => {});
  await prisma.journalEntry.deleteMany({ where: { tenantId, entryNumber: { startsWith: 'GRN-' } } }).catch(() => {});
  await prisma.vendorLedger.deleteMany({ where: { tenantId } }).catch(() => {});

  await teardown(); await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll purchase tests done');
  process.exit(hasFailures ? 1 : 0);
}
main().catch((e) => { console.error('PURCHASE TEST FAILED:', e); process.exit(1); });
