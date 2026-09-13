import prisma from '../lib/prisma';

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let created = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const existing = await prisma.customer.findFirst({
      where: { tenantId: tenant.id, customerCode: 'WALKIN' },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        customerCode: 'WALKIN',
        fullName: 'Walk-in Customer',
        isActive: true,
        creditLimit: 0,
        currentBalance: 0,
      },
    });
    created++;
  }

  console.log(`Walk-in customers: ${created} created, ${skipped} already existed`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
