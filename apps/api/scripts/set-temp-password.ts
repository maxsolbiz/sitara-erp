import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/helpers';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * One-time utility: set a temporary password for a user and force a password
 * change on next login. Prints the temp password ONCE (capture it securely).
 * Usage: npx tsx apps/api/scripts/set-temp-password.ts <email> [tenantSlug]
 */
async function main() {
  const email = process.argv[2];
  const slug = process.argv[3];
  if (!email) {
    console.error('Usage: set-temp-password.ts <email> [tenantSlug]');
    process.exit(1);
  }
  const where: any = { email };
  if (slug) {
    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) { console.error('TENANT_NOT_FOUND'); process.exit(1); }
    where.tenantId = tenant.id;
  }
  const user = await prisma.user.findFirst({ where });
  if (!user) { console.error('USER_NOT_FOUND'); process.exit(1); }
  const temp = crypto.randomBytes(12).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(temp), mustChangePassword: true, loginAttempts: 0, lockedUntil: null },
  });
  // Kill existing sessions so only the temp-password login works going forward
  await prisma.userSession.updateMany({ where: { userId: user.id }, data: { isActive: false } }).catch(() => {});
  console.log(`TEMP_PASSWORD_SET for ${email} (tenant ${user.tenantId}): ${temp}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error('FAILED:', (e as Error).message); process.exit(1); });
