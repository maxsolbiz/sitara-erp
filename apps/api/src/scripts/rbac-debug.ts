import { hashPassword, verifyPassword } from '../utils/helpers';
import pkg from '../lib/prisma';

async function main() {
  const prisma = pkg;
  const pw = 'admin123';
  const hash = await hashPassword(pw);
  console.log('Hash OK:', hash.substring(0, 20) + '...');

  const user = await prisma.user.findFirst({ where: { username: 'rbac-admin' as any } });
  if (user) {
    console.log('User found:', user.email);
    console.log('Hash:', (user.passwordHash as string).substring(0, 20) + '...');
    const valid = await verifyPassword(pw, user.passwordHash);
    console.log('Verify result:', valid);
  } else {
    console.log('User rbac-admin not found');
    const users = await prisma.user.findMany({ where: { username: { contains: 'rbac' as any } } });
    console.log('rbac* users:', users.length);
  }

  await prisma.$disconnect();
}

main().catch(e => console.error('Error:', e.message));
