import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { logActivity } from '../src/utils/activity';
import { setTenantContext } from '../src/lib/prisma';

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;
function pass(n: string) { passed++; console.log(`  [PASS] ${n}`); }
function fail(n: string, r: string) { failed++; console.log(`  [FAIL] ${n} — ${r}`); }

async function main() {
  console.log('\n=== Activity Helper Tests ===\n');
  const tenant = (await prisma.tenant.findFirst({ where: { slug: 'test-tenant' } }))!;
  setTenantContext({ tenantId: tenant.id, tenantSlug: 'test-tenant' });

  // Positive control: valid call writes a row
  try {
    await logActivity({
      tenantId: tenant.id, action: 'TEST', entityType: 'test', description: 'helper self-test',
    });
    const row = await prisma.activityLog.findFirst({
      where: { tenantId: tenant.id, action: 'TEST' }, orderBy: { createdAt: 'desc' },
    });
    if (row) pass('H1: valid call writes row');
    else fail('H1', 'row missing');
    if (row) await prisma.activityLog.delete({ where: { id: row.id } }).catch(() => {});
  } catch (e: any) { fail('H1', 'threw: ' + e.message); }

  // Negative 1: FK violation (nonexistent tenant) must NOT throw
  try {
    await logActivity({
      tenantId: 999999999n, action: 'TEST', entityType: 'test', description: 'forced FK failure',
    });
    pass('H2: FK failure swallowed (no throw)');
  } catch (e: any) { fail('H2', 'threw: ' + e.message); }

  // Negative 2: oversized action (VarChar(50)) must NOT throw/reject
  try {
    await Promise.race([
      logActivity({
        tenantId: tenant.id, action: 'X'.repeat(200), entityType: 'test', description: 'forced length failure',
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('HUNG')), 15000)),
    ]);
    pass('H3: oversized field swallowed (no throw, no hang)');
  } catch (e: any) { fail('H3', 'threw/hung: ' + e.message); }

  await prisma.$disconnect();
  console.log(failed > 0 ? '\nFAILURES DETECTED' : '\nAll activity helper tests done');
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error('HELPER TEST FAILED:', (e as Error).message); process.exit(1); });
