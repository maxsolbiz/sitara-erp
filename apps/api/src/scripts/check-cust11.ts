import prisma from '../lib/prisma';
async function main() {
  const customer = await prisma.customer.findFirst({ where: { id: 11n as any } });
  if (!customer) { console.log('Customer 11 not found'); return; }
  console.log('Customer:', customer.fullName, customer.customerCode, 'Balance:', customer.currentBalance);
  const firstEntry = await prisma.customerLedger.findFirst({
    where: { tenantId: customer.tenantId, customerId: customer.id },
    orderBy: { createdAt: 'asc' },
  });
  if (firstEntry) {
    console.log('First entry:', firstEntry.type, firstEntry.amount, 'before:', firstEntry.balanceBefore, 'after:', firstEntry.balanceAfter);
    console.log('firstBefore !== 0:', Number(firstEntry.balanceBefore) !== 0);
    console.log('firstBefore !== balance:', Number(firstEntry.balanceBefore) !== Number(customer.currentBalance));
  } else {
    console.log('No first entry found');
  }
  const mig = await prisma.customerLedger.findFirst({
    where: { tenantId: customer.tenantId, customerId: customer.id, type: 'MIGRATION' as any },
  });
  console.log('Migration entry exists:', !!mig);
  await prisma.$disconnect();
}
main().catch(console.error);
