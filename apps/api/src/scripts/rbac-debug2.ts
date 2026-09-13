import { hashPassword, verifyPassword } from '../utils/helpers';
import pkg from '../lib/prisma';

async function main() {
  const prisma = pkg;
  const user = await prisma.user.findFirst({ where: { username: 'rbac-admin' as any } });
  if (!user) { console.log('User not found'); return; }
  console.log('tenantId:', user.tenantId.toString());
  console.log('isActive:', user.isActive);
  console.log('status:', user.status);
  console.log('lockedUntil:', user.lockedUntil);
  console.log('loginAttempts:', user.loginAttempts);
  console.log('isSuperAdmin:', user.isSuperAdmin);

  const valid = await verifyPassword('admin123', user.passwordHash);
  console.log('Password valid:', valid);
  await prisma.$disconnect();
}
main().catch(e => console.error('Error:', e.message));
