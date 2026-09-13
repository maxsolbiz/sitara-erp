import pkg from '../lib/prisma';
async function main() {
  const prisma = pkg;
  const tenant = await prisma.tenant.findFirst({ where: { id: 2n as any } });
  if (tenant) console.log('Tenant 2:', tenant.name, tenant.status);
  else console.log('Tenant 2 not found');
  const user = await prisma.user.findFirst({ where: { email: 'rbac-admin@test.com' as any } });
  if (user) {
    console.log('User:', user.email, 'tenantId:', user.tenantId.toString(), 'status:', user.status);
  } else {
    console.log('User not found by email');
  }
  await prisma.$disconnect();
}
main().catch(e => console.error('Error:', e.message));
