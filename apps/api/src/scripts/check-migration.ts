import prisma from '../lib/prisma';
async function main() {
  const entries = await prisma.customerLedger.findMany({
    where: { type: 'MIGRATION' as any },
    include: { customer: { select: { fullName: true, customerCode: true, currentBalance: true } } },
  });
  console.log('MIGRATION entries found:', entries.length);
  for (const e of entries) {
    console.log(`  #${e.id} cust=${e.customer?.fullName}(${e.customer?.customerCode}) amount=${e.amount} before=${e.balanceBefore} after=${e.balanceAfter}`);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
