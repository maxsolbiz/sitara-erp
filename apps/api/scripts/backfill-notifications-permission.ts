import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TARGET_ROLES = ['manager', 'cashier', 'accountant'];
const SLUG = 'notifications.view';

/**
 * One-time backfill: grant 'notifications.view' to manager/cashier/accountant
 * roles in pre-existing tenants (auth.service seed only covers new tenants).
 * Idempotent. Dry-run by default; pass --apply to write.
 */
async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`=== Backfill ${SLUG} (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  let wouldGrant = 0, alreadyHave = 0, missingPerm = 0;

  for (const t of tenants) {
    let perm = await prisma.permission.findFirst({
      where: { tenantId: t.id, slug: SLUG },
      select: { id: true },
    });
    if (!perm) {
      if (apply) {
        perm = await prisma.permission.upsert({
          where: { tenantId_slug: { tenantId: t.id, slug: SLUG } },
          update: {},
          create: { tenantId: t.id, name: 'Notifications View', slug: SLUG, module: 'notifications' },
          select: { id: true },
        });
        console.log(`  [CREATED] tenant=${t.slug} permission=${SLUG}`);
      } else {
        console.log(`  [WOULD-CREATE] tenant=${t.slug} permission=${SLUG}`);
      }
    }
    const roles = await prisma.role.findMany({
      where: { tenantId: t.id, slug: { in: TARGET_ROLES } },
      select: { id: true, slug: true },
    });
    if (!perm) {
      // Dry-run with no permission row yet: preview the grants that would follow creation.
      for (const r of roles) {
        wouldGrant++;
        console.log(`  [WOULD-GRANT] tenant=${t.slug} role=${r.slug} (after permission create)`);
      }
      missingPerm++;
      continue;
    }
    for (const r of roles) {
      const link = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: r.id, permissionId: perm.id } },
      });
      if (link) {
        alreadyHave++;
      } else {
        wouldGrant++;
        if (apply) {
          await prisma.rolePermission.create({ data: { roleId: r.id, permissionId: perm.id } });
          console.log(`  [GRANTED] tenant=${t.slug} role=${r.slug}`);
        } else {
          console.log(`  [WOULD-GRANT] tenant=${t.slug} role=${r.slug}`);
        }
      }
    }
  }

  console.log(`\nDone. tenants=${tenants.length} alreadyHave=${alreadyHave} ${apply ? 'granted' : 'wouldGrant'}=${wouldGrant} missingPermTenants=${missingPerm}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error('BACKFILL FAILED:', e.message); process.exit(1); });
