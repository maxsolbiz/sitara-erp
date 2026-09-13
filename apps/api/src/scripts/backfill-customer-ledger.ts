import prisma from '../lib/prisma';

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    const tenantId = tenant.id;

    // Find all completed sales with a named customer
    const sales = await prisma.sale.findMany({
      where: {
        tenantId,
        customerId: { not: null },
        status: 'COMPLETED',
      },
      include: {
        customer: { select: { id: true, customerCode: true, currentBalance: true } },
        items: { select: { quantity: true, unitPrice: true, lineTotal: true } },
      },
    });

    let created = 0;
    let skipped = 0;

    for (const sale of sales) {
      if (!sale.customer || sale.customer.customerCode === 'WALKIN') {
        skipped++;
        continue;
      }

      // Check if a ledger entry already exists for this sale
      const existing = await prisma.customerLedger.findFirst({
        where: { tenantId, customerId: sale.customerId!, referenceId: sale.id, referenceType: 'sale' },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const saleItems = sale.items.filter((i) => i.quantity > 0);
      const returnItems = sale.items.filter((i) => i.quantity < 0);
      const saleSubtotal = saleItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
      const returnSubtotal = returnItems.reduce((s, i) => s + Math.abs(Number(i.unitPrice) * i.quantity), 0);
      const netTotal = saleSubtotal - returnSubtotal;

      // Determine balance before: we need the customer's balance at the time of this sale
      // Use current balance as approximation (true balance before = current + netBalanceChange)
      // For a Paid sale with no balance change, balance before = balance after = current balance
      const currentBalance = Number(sale.customer.currentBalance);

      // Check if this sale changed the customer balance by looking at whether
      // credit was involved and what the payment method was
      const payments = await prisma.salePayment.findMany({
        where: { saleId: sale.id },
      });
      const creditPortion = payments.filter((p) => p.paymentMethod === 'CREDIT')
        .reduce((s, p) => s + Number(p.amount), 0);
      const cashPortion = payments.filter((p) => p.paymentMethod !== 'CREDIT')
        .reduce((s, p) => s + Number(p.amount), 0);
      const customerCredit = netTotal < 0 ? Math.abs(netTotal) : 0;
      const netBalanceChange = customerCredit + creditPortion;

      const before = currentBalance - netBalanceChange;
      const balanceAfter = currentBalance;
      const type = netBalanceChange > 0 ? 'SALE' : 'SALE';

      await prisma.customerLedger.create({
        data: {
          tenantId,
          customerId: sale.customerId!,
          type,
          amount: Math.abs(netBalanceChange) || saleSubtotal,
          balanceBefore: before,
          balanceAfter,
          referenceId: sale.id,
          referenceType: 'sale',
          notes: `Sale ${sale.saleNumber}`,
          createdBy: sale.createdBy,
          createdAt: sale.createdAt,
        },
      });
      created++;
    }

    console.log(`Tenant ${tenantId}: ${created} created, ${skipped} skipped`);
  }

  console.log('Done');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
