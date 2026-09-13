import prisma from '../lib/prisma';

/**
 * Creates opening balance ledger entries for customers migrated from
 * the legacy PHP system who have a non-zero currentBalance but no
 * MIGRATION-type ledger entry explaining where it came from.
 */
async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let created = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const customers = await prisma.customer.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
    });

    for (const customer of customers) {
      const balance = Number(customer.currentBalance);
      if (balance === 0) { skipped++; continue; }

      // Check if this customer already has a MIGRATION entry
      const existingMigration = await prisma.customerLedger.findFirst({
        where: { tenantId: tenant.id, customerId: customer.id, type: 'MIGRATION' },
      });
      if (existingMigration) { skipped++; continue; }

      // Check if customer has any ledger entries — if they already have
      // entries with correct running balance, we may still need an opening entry
      const firstEntry = await prisma.customerLedger.findFirst({
        where: { tenantId: tenant.id, customerId: customer.id },
        orderBy: { createdAt: 'asc' },
      });

      // Only create MIGRATION entry if the first entry's balanceBefore is non-zero
      // without a prior MIGRATION entry explaining where it came from
      if (firstEntry) {
        const firstBefore = Number(firstEntry.balanceBefore);
        // If the first entry starts at 0, the balance properly chains from zero
        // If it starts at a non-zero value, we need a MIGRATION entry to explain it
        if (firstBefore === 0) {
          skipped++;
          continue;
        }
      }

      // Insert MIGRATION entry with createdAt slightly before the first existing entry
      const createdAt = firstEntry
        ? new Date(firstEntry.createdAt.getTime() - 1000)
        : customer.createdAt;

      await prisma.customerLedger.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          type: 'MIGRATION',
          amount: balance,
          balanceBefore: 0,
          balanceAfter: balance,
          referenceType: 'migration',
          notes: `Opening balance from legacy system`,
          createdBy: 1,
          createdAt,
        },
      });

      // Now update all subsequent entries to have correct running balance
      // Recalculate the running balance starting from this MIGRATION entry
      const subsequentEntries = await prisma.customerLedger.findMany({
        where: { tenantId: tenant.id, customerId: customer.id, type: { not: 'MIGRATION' } },
        orderBy: { createdAt: 'asc' },
      });

      let runningBalance = balance;
      for (const entry of subsequentEntries) {
        const newBefore = runningBalance;
        const amount = Number(entry.amount);
        if (entry.type === 'PAYMENT') {
          runningBalance -= amount;
        } else if (entry.type === 'SALE' || entry.type === 'ADJUSTMENT') {
          runningBalance += amount;
        } else {
          runningBalance += amount;
        }
        const newAfter = runningBalance;
        if (Number(entry.balanceBefore) !== newBefore || Number(entry.balanceAfter) !== newAfter) {
          await prisma.customerLedger.update({
            where: { id: entry.id },
            data: { balanceBefore: newBefore, balanceAfter: newAfter },
          });
        }
      }

      created++;
    }
  }

  console.log(`Opening balance entries: ${created} created, ${skipped} skipped`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
