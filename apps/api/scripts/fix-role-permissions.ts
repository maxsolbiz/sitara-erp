import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const MISSING_MANAGER = ['settings.update', 'expenses.approve', 'expenses.pay'];
const MISSING_ACCOUNTANT = ['expenses.pay', 'customers.payments', 'vendors.payments'];
const ALL_MISSING = [...new Set([...MISSING_MANAGER, ...MISSING_ACCOUNTANT])];

async function main() {
  console.log('=== Fix Role Permissions ===\n');
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    // Ensure all missing permission records exist
    const permMap: Record<string, bigint> = {};
    for (const slug of ALL_MISSING) {
      const [mod] = slug.split('.');
      const perm = await prisma.permission.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug } },
        update: {},
        create: { tenantId: tenant.id, name: slug.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), slug, module: mod },
      });
      permMap[slug] = perm.id;
    }

    // Fix Manager role
    const mgrRole = await prisma.role.findFirst({ where: { tenantId: tenant.id, slug: 'manager' } });
    if (mgrRole) {
      let added = 0;
      for (const slug of MISSING_MANAGER) {
        const pid = permMap[slug];
        if (pid) {
          const existing = await prisma.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: mgrRole.id, permissionId: pid } } });
          if (!existing) { await prisma.rolePermission.create({ data: { roleId: mgrRole.id, permissionId: pid } }); added++; }
        }
      }
      if (added > 0) console.log(`  ${tenant.name}: Manager +${added} permissions`);
    }

    // Fix Accountant role
    const acctRole = await prisma.role.findFirst({ where: { tenantId: tenant.id, slug: 'accountant' } });
    if (acctRole) {
      let added = 0;
      for (const slug of MISSING_ACCOUNTANT) {
        const pid = permMap[slug];
        if (pid) {
          const existing = await prisma.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: acctRole.id, permissionId: pid } } });
          if (!existing) { await prisma.rolePermission.create({ data: { roleId: acctRole.id, permissionId: pid } }); added++; }
        }
      }
      if (added > 0) console.log(`  ${tenant.name}: Accountant +${added} permissions`);
    }
  }

  console.log('\nDone');
  await prisma.$disconnect();
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
