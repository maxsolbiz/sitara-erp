import pkg from '../lib/prisma';
async function main() {
  const prisma = pkg;
  const users = await prisma.user.findMany({ where: { email: 'rbac-admin@test.com' as any } });
  console.log('Users with that email:', users.length);
  for (const u of users) {
    console.log(`  id=${u.id} tenantId=${u.tenantId} username=${u.username} active=${u.isActive} status=${u.status}`);
  }
  if (users.length === 0) {
    console.log('No users found, trying username search:');
    const byName = await prisma.user.findMany({ where: { username: { contains: 'rbac' as any } } });
    console.log('rbac* users:', byName.length);
    for (const u of byName) {
      console.log(`  id=${u.id} tenantId=${u.tenantId} username=${u.username} email=${u.email}`);
    }
  }
  await prisma.$disconnect();
}
main().catch(e => console.error('Error:', e.message));
