import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('=== DIRECT SANITY CHECK ===\n');

  // 1. Ledger models exist
  try {
    const clCount = await prisma.customerLedger.count();
    const vlCount = await prisma.vendorLedger.count();
    console.log(`[PASS] CustomerLedger: ${clCount} rows`);
    console.log(`[PASS] VendorLedger: ${vlCount} rows`);
  } catch (e: any) { console.log(`[FAIL] Ledger models: ${e.message}`); }

  // 2. VendorLedger fields match CustomerLedger
  try {
    const clAttrs = Object.keys(prisma.customerLedger.fields);
    const vlAttrs = Object.keys(prisma.vendorLedger.fields);
    // Replace customerId vs vendorId diff
    const clSet = new Set(clAttrs.map(a => a === 'customerId' ? 'vendorId' : a));
    const vlSet = new Set(vlAttrs);
    const missing = [...clSet].filter(a => !vlSet.has(a) && a !== 'customerId');
    if (missing.length === 0) console.log(`[PASS] Ledger structures match (${clAttrs.length} fields each)`);
    else console.log(`[FAIL] VendorLedger missing fields: ${missing.join(', ')}`);
  } catch (e: any) { console.log(`[FAIL] Structure compare: ${e.message}`); }

  // 3. Inventory movements have PURCHASE_IN type
  try {
    const types = await prisma.stockMovement.groupBy({ by: ['movementType'], _count: true });
    const typeNames = types.map(t => t.movementType);
    const expected = ['SALE_OUT', 'SALE_RETURN', 'SALE_VOID', 'PURCHASE_IN', 'PURCHASE_RETURN', 'ADJUSTMENT'];
    const missing = expected.filter(e => !typeNames.includes(e));
    if (missing.length === 0) console.log(`[PASS] All movement types exist: ${typeNames.join(', ')}`);
    else console.log(`[WARN] Missing movement types: ${missing.join(', ')}`);
  } catch (e: any) { console.log(`[FAIL] Movement types: ${e.message}`); }

  // 4. StockAdjustment model works
  try {
    const adjCount = await prisma.stockAdjustment.count();
    console.log(`[PASS] StockAdjustment model: ${adjCount} records`);
  } catch (e: any) { console.log(`[FAIL] StockAdjustment: ${e.message}`); }

  console.log('\n=== DONE ===');
  await prisma.$disconnect();
}

main().catch(e => { console.error('FAILED:', e); process.exit(1); });
