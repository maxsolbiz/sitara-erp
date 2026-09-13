import { prisma, setup, teardown, api, pass, fail, hasFailures, tenantId, productAId, productBId, namedId, walkinId, whId } from './test-util';

async function main() {
  await setup(); console.log('\n=== Sales & Returns Tests ===\n');
  let saleId = '', retId = '', saleNumber = '';

  // A1-A3: Sales list & detail
  try {
    // Create a sale first
    const s = await api('POST', '/api/v1/pos/checkout', { items: [{ productId: Number(productAId), quantity: 1, unitPrice: 1000, discountAmount: 0 }], payments: [{ method: 'CASH', amount: 1000 }], customerId: Number(namedId), discount: 0 });
    if (s.status === 201) { saleId = s.body.data.saleId; saleNumber = s.body.data.saleNumber; pass('Setup: Sale created'); }
  } catch (e: any) { fail('Setup', e.message); }

  try { const r = await api('GET', '/api/v1/sales'); if (r.status === 200 && r.body?.data?.length >= 0) pass('A1: List'); else fail('A1', `Status ${r.status}`); } catch (e: any) { fail('A1', e.message); }
  try { const r = await api('GET', `/api/v1/sales/${saleId}`); if (r.status === 200 && r.body?.data?.items?.length > 0) pass('A2: Detail'); else fail('A2', `Status ${r.status}`); } catch (e: any) { fail('A2', e.message); }
  try { const r = await api('GET', '/api/v1/sales/stats'); if (r.status === 200 && r.body?.data?.todaySales !== undefined) pass('A3: Stats'); else fail('A3', `Status ${r.status}`); } catch (e: any) { fail('A3', e.message); }

  // B1-B5: Sales Returns (Office Flow)
  const snapStock = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productAId } });
  const stockBefore = snapStock ? Number(snapStock.quantity) : 0;

  // Get a real sale item ID
  const saleItems = await prisma.saleItem.findMany({ where: { saleId: BigInt(saleId) }, take: 1 });
  const saleItemId = saleItems.length > 0 ? saleItems[0].id.toString() : '0';
  try {
    const r = await api('POST', '/api/v1/sales-returns', { saleId: Number(saleId), reason: 'defective', items: [{ saleItemId, quantity: 1, unitPrice: 1000 }] });
    if (r.status === 201 && r.body?.data?.status === 'PENDING') { pass('B1: Return PENDING'); retId = r.body.data.id; } else fail('B1', `Status ${r.status}`);
    const stock = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productAId } });
    if (stock && Number(stock.quantity) === stockBefore) pass('B1: Stock unchanged'); else fail('B1: Stock changed', `Expected ${stockBefore}`);
    const cust = await prisma.customer.findFirst({ where: { id: namedId } });
    if (cust && Number(cust.currentBalance) === 0) pass('B1: Balance unchanged'); else fail('B1: Balance changed', `Got ${cust?.currentBalance}`);
  } catch (e: any) { fail('B1', e.message); }

  // B2: Approve
  try {
    const r = await api('PATCH', `/api/v1/sales-returns/${retId}/approve`, { refundMethod: 'cash' });
    if (r.status === 200) pass('B2: Approved'); else fail('B2', `Status ${r.status}`);
    const sret = await prisma.salesReturn.findFirst({ where: { id: BigInt(retId) } });
    if (sret?.status === 'APPROVED') pass('B2: Status APPROVED'); else fail('B2: Status', `Got ${sret?.status}`);
    const stock = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productAId } });
    if (stock && Number(stock.quantity) === stockBefore + 1) pass('B2: Stock restored'); else fail('B2: Stock', `Expected ${stockBefore + 1}, got ${stock?.quantity}`);
    const je = await prisma.journalEntry.findFirst({ where: { tenantId, description: { contains: 'Return' } }, orderBy: { createdAt: 'desc' } });
    if (je) pass('B2: Journal'); else fail('B2: Journal', 'Not found');
  } catch (e: any) { fail('B2', e.message); }

  // Cleanup — create new PENDING return for reject test
  let retId2 = '';
  try {
    // Restore stock first
    await prisma.warehouseStock.updateMany({ where: { tenantId, warehouseId: whId, productId: productAId }, data: { quantity: stockBefore } }).catch(() => {});
    const r = await api('POST', '/api/v1/sales-returns', { saleId: Number(saleId), reason: 'defective', items: [{ saleItemId, quantity: 1, unitPrice: 1000 }] });
    if (r.status === 201) { retId2 = r.body.data.id; pass('Setup: Return 2'); }
  } catch (e: any) { fail('Setup', e.message); }

  if (retId2) {
    try {
      const r = await api('PATCH', `/api/v1/sales-returns/${retId2}/reject`, { reason: 'Test rejection' });
      if (r.status === 200) pass('B3: Rejected'); else fail('B3', `Status ${r.status}`);
      const sret = await prisma.salesReturn.findFirst({ where: { id: BigInt(retId2) } });
      if (sret?.status === 'REJECTED' && sret?.rejectionReason === 'Test rejection') pass('B3: REJECTED + reason'); else fail('B3', `Got ${sret?.status}, reason: ${sret?.rejectionReason}`);
      const stock = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productAId } });
      if (stock && Number(stock.quantity) === stockBefore) pass('B3: Stock unchanged'); else fail('B3: Stock changed');
    } catch (e: any) { fail('B3', e.message); }

    try { const r = await api('PATCH', `/api/v1/sales-returns/${retId2}/approve`, { refundMethod: 'cash' }); if (r.status === 400) pass('B4: Cannot approve rejected'); else fail('B4', `Status ${r.status}`); } catch (e: any) { fail('B4', e.message); }
  }

  // B5: Cannot approve already-approved
  try { const r = await api('PATCH', `/api/v1/sales-returns/${retId}/approve`, { refundMethod: 'cash' }); if (r.status === 400) pass('B5: Cannot approve again'); else fail('B5', `Status ${r.status}`); } catch (e: any) { fail('B5', e.message); }

  // C1-C3: Void sale
  try {
    const snap = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productAId } });
    const beforeVoid = snap ? Number(snap.quantity) : 0;
    const r = await api('PATCH', `/api/v1/sales/${saleId}/void`, { voidReason: 'Test void' });
    if (r.status === 200) pass('C1: Void accepted'); else fail('C1', `Status ${r.status}`);
    const sale = await prisma.sale.findFirst({ where: { id: BigInt(saleId) } });
    if (sale?.status === 'CANCELLED') pass('C1: Status CANCELLED'); else fail('C1: Status', `Got ${sale?.status}`);
    const stock = await prisma.warehouseStock.findFirst({ where: { tenantId, warehouseId: whId, productId: productAId } });
    if (stock && Number(stock.quantity) === beforeVoid + 1) pass('C1: Stock restored'); else fail('C1: Stock', `Before ${beforeVoid}, After ${stock?.quantity}`);
    const je = await prisma.journalEntry.findFirst({ where: { tenantId, description: { contains: 'Void sale' } }, orderBy: { createdAt: 'desc' } });
    if (je) pass('C1: Reversal journal'); else fail('C1: Journal', 'Not found');
  } catch (e: any) { fail('C1', e.message); }

  try { const r = await api('PATCH', `/api/v1/sales/${saleId}/void`, {}); if (r.status === 400) pass('C2: Cannot void twice'); else fail('C2', `Status ${r.status}`); } catch (e: any) { fail('C2', e.message); }

  try {
    // Create sale with yesterday's date
    const yesterday = new Date(Date.now() - 86400000);
    const sale = await prisma.sale.create({ data: { tenantId, saleNumber: 'OLD-VOID-TEST', saleDate: yesterday, subtotal: 1000, totalAmount: 1000, paidAmount: 1000, status: 'COMPLETED', createdBy: BigInt(1) } });
    const r = await api('PATCH', `/api/v1/sales/${sale.id.toString()}/void`, {});
    if (r.status === 400) pass('C3: Past sale rejected'); else fail('C3', `Status ${r.status}`);
    await prisma.sale.delete({ where: { id: sale.id } }).catch(() => {});
  } catch (e: any) { fail('C3', e.message); }

  // Cleanup
  await prisma.saleItem.deleteMany({ where: { saleId: BigInt(saleId) } }).catch(() => {});
  await prisma.salePayment.deleteMany({ where: { saleId: BigInt(saleId) } }).catch(() => {});
  await prisma.sale.updateMany({ where: { id: BigInt(saleId) }, data: { status: 'COMPLETED' } }).catch(() => {});
  await prisma.warehouseStock.updateMany({ where: { tenantId, warehouseId: whId, productId: productAId }, data: { quantity: stockBefore } }).catch(() => {});
  await prisma.salesReturn.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.customerLedger.deleteMany({ where: { tenantId } }).catch(() => {});

  await teardown(); await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll sales tests done');
  process.exit(hasFailures ? 1 : 0);
}
main().catch((e) => { console.error('SALES TEST FAILED:', e); process.exit(1); });
