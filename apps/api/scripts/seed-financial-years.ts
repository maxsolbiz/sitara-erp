import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('=== Seed Financial Years ===\n');
  const now = new Date();
  const y = now.getFullYear();
  const defaultStart = new Date(y, 6, 1); // July 1
  const defaultEnd = new Date(y + 1, 5, 30); // June 30 next year

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const tenant of tenants) {
    const existing = await prisma.financialYear.findFirst({ where: { tenantId: tenant.id } });
    if (existing) {
      console.log(`  ${tenant.name}: already has FY (${existing.name}), skipping`);
    } else {
      const fy = await prisma.financialYear.create({
        data: { tenantId: tenant.id, name: `FY ${y}-${(y + 1).toString().slice(2)}`, startDate: defaultStart, endDate: defaultEnd, status: 'OPEN' },
      });
      console.log(`  ${tenant.name}: created FY ${fy.name}`);
    }
  }

  console.log('\nDone');
  await prisma.$disconnect();
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
