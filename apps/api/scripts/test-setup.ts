import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/helpers';

const prisma = new PrismaClient();

async function main() {
  console.log('=== TEST SETUP ===');

  // 1. Tenant
  let tenant = await prisma.tenant.findFirst({ where: { slug: 'test-tenant' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'Test Tenant', slug: 'test-tenant', plan: 'starter', status: 'active', settings: { companyName: 'Test Company', address: '123 Test St', phone: '042-1111111', email: 'test@test.com' } },
    });
    console.log(`  Created tenant: ${tenant.id}`);
  } else {
    console.log(`  Using existing tenant: ${tenant.id}`);
  }
  const tenantId = tenant.id;

  // 2. Chart of Accounts
  const accounts = [
    { accountCode: '1000', accountName: 'Cash on Hand', accountType: 'ASSET' },
    { accountCode: '1100', accountName: 'Accounts Receivable', accountType: 'ASSET' },
    { accountCode: '1200', accountName: 'Inventory', accountType: 'ASSET' },
    { accountCode: '1300', accountName: 'Inventory (Alt)', accountType: 'ASSET' },
    { accountCode: '2000', accountName: 'Accounts Payable', accountType: 'LIABILITY' },
    { accountCode: '4000', accountName: 'Sales Revenue', accountType: 'REVENUE' },
    { accountCode: '4100', accountName: 'Sales Returns', accountType: 'CONTRA_REVENUE' },
    { accountCode: '5000', accountName: 'Cost of Goods Sold', accountType: 'EXPENSE' },
  ];
  for (const acct of accounts) {
    await prisma.chartOfAccount.upsert({
      where: { tenantId_accountCode: { tenantId, accountCode: acct.accountCode } },
      create: { tenantId, accountCode: acct.accountCode, accountName: acct.accountName, accountType: acct.accountType },
      update: {},
    });
  }
  console.log('  Accounts created/verified');

  // 3. Users
  const cashierPw = await hashPassword('cashier123');
  let cashier = await prisma.user.findFirst({ where: { username: 'testcashier', tenantId } });
  if (!cashier) {
    cashier = await prisma.user.create({
      data: { tenantId, username: 'testcashier', email: 'cashier@test.com', passwordHash: cashierPw, fullName: 'Test Cashier', isActive: true, status: 'active' },
    });
  }
  const managerPw = await hashPassword('manager123');
  let manager = await prisma.user.findFirst({ where: { username: 'testmanager', tenantId } });
  if (!manager) {
    manager = await prisma.user.create({
      data: { tenantId, username: 'testmanager', email: 'manager@test.com', passwordHash: managerPw, fullName: 'Test Manager', isActive: true, status: 'active', isSuperAdmin: true },
    });
  }
  console.log('  Users created/verified');

  // Seed RBAC permissions and roles for test tenant
  const testPerms = ['pos.access', 'pos.sales.create', 'pos.sales.hold', 'pos.sales.void', 'pos.returns.create', 'pos.returns.process', 'pos.sales.view', 'pos.daily.close', 'sales.view', 'customers.view', 'customers.create', 'customers.payments'];
  const permRecords: Record<string, bigint> = {};
  for (const slug of testPerms) {
    const [mod] = slug.split('.');
    const p = await prisma.permission.upsert({
      where: { tenantId_slug: { tenantId, slug } },
      update: {},
      create: { tenantId, name: slug.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), slug, module: mod },
    });
    permRecords[slug] = p.id;
  }
  // Cashier role
  let cashierRole = await prisma.role.findFirst({ where: { tenantId, slug: 'cashier' } });
  if (!cashierRole) {
    cashierRole = await prisma.role.create({ data: { tenantId, name: 'Cashier', slug: 'cashier', description: 'POS operator', isSystem: true } });
    for (const slug of testPerms) {
      const pid = permRecords[slug];
      if (pid) await prisma.rolePermission.create({ data: { roleId: cashierRole.id, permissionId: pid } });
    }
  }
  // Assign cashier role to test cashier user
  if (cashierRole && cashier) {
    const existing = await prisma.roleUser.findUnique({ where: { userId_roleId: { userId: cashier.id, roleId: cashierRole.id } } });
    if (!existing) await prisma.roleUser.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
  }
  console.log('  RBAC roles/permissions seeded');

  // 4. Customers
  let walkin = await prisma.customer.findFirst({ where: { customerCode: 'WALKIN', tenantId } });
  if (!walkin) {
    walkin = await prisma.customer.create({
      data: { tenantId, customerCode: 'WALKIN', fullName: 'Walk-in Customer', isActive: true },
    });
  }

  let namedCustomer = await prisma.customer.findFirst({ where: { customerCode: 'TEST-NAMED', tenantId } });
  if (!namedCustomer) {
    namedCustomer = await prisma.customer.create({
      data: { tenantId, customerCode: 'TEST-NAMED', fullName: 'Test Named Customer', phone: '0300-1234567', creditLimit: 10000, currentBalance: 0, isActive: true },
    });
  }

  // 5. Pricing Tier
  let tier = await prisma.pricingTier.findFirst({ where: { name: 'Wholesale', tenantId } });
  if (!tier) {
    tier = await prisma.pricingTier.create({
      data: { tenantId, name: 'Wholesale', discountPercent: 10, isActive: true },
    });
  }

  let tierCustomer = await prisma.customer.findFirst({ where: { customerCode: 'TEST-TIER', tenantId } });
  if (!tierCustomer) {
    tierCustomer = await prisma.customer.create({
      data: { tenantId, customerCode: 'TEST-TIER', fullName: 'Test Tier Customer', phone: '0300-7654321', creditLimit: 50000, currentBalance: 0, isActive: true, pricingTierId: tier.id },
    });
  } else if (!tierCustomer.pricingTierId) {
    await prisma.customer.update({ where: { id: tierCustomer.id }, data: { pricingTierId: tier.id } });
  }

  // 6. Products
  const now = new Date();
  let productA = await prisma.product.findFirst({ where: { sku: 'TST-PRODA', tenantId } });
  if (!productA) {
    productA = await prisma.product.create({
      data: { tenantId, name: 'Test Product A', sku: 'TST-PRODA', barcode: 'BARCODE-A', sellingPrice: 1000, costPrice: 600, unitOfMeasure: 'pcs', isActive: true },
    });
  }

  let productB = await prisma.product.findFirst({ where: { sku: 'TST-PRODB', tenantId } });
  if (!productB) {
    productB = await prisma.product.create({
      data: { tenantId, name: 'Test Product B', sku: 'TST-PRODB', barcode: 'BARCODE-B', sellingPrice: 500, costPrice: 300, unitOfMeasure: 'pcs', isActive: true },
    });
  }

  // 7. Warehouse + Stock
  let wh = await prisma.warehouse.findFirst({ where: { name: 'Main Warehouse', tenantId } });
  if (!wh) {
    wh = await prisma.warehouse.create({
      data: { tenantId, name: 'Main Warehouse', code: 'MAIN', isActive: true },
    });
  }

  // Stock for Product A
  await prisma.warehouseStock.upsert({
    where: { tenantId_warehouseId_productId: { tenantId, warehouseId: wh.id, productId: productA.id } },
    create: { tenantId, warehouseId: wh.id, productId: productA.id, quantity: 50, averageCost: 600 },
    update: { quantity: 50, averageCost: 600 },
  });

  // Stock for Product B
  await prisma.warehouseStock.upsert({
    where: { tenantId_warehouseId_productId: { tenantId, warehouseId: wh.id, productId: productB.id } },
    create: { tenantId, warehouseId: wh.id, productId: productB.id, quantity: 20, averageCost: 300 },
    update: { quantity: 20, averageCost: 300 },
  });

  // FIFO batches
  const existingBatchA = await prisma.stockBatch.findFirst({ where: { tenantId, warehouseId: wh.id, productId: productA.id } });
  if (!existingBatchA) {
    await prisma.stockBatch.create({
      data: { tenantId, warehouseId: wh.id, productId: productA.id, batchNumber: 'INIT-A', quantityReceived: 50, quantityRemaining: 50, unitCost: 600, receivedAt: now },
    });
  }

  const existingBatchB = await prisma.stockBatch.findFirst({ where: { tenantId, warehouseId: wh.id, productId: productB.id } });
  if (!existingBatchB) {
    await prisma.stockBatch.create({
      data: { tenantId, warehouseId: wh.id, productId: productB.id, batchNumber: 'INIT-B', quantityReceived: 20, quantityRemaining: 20, unitCost: 300, receivedAt: now },
    });
  }

  console.log('  Products + stock created/verified');
  console.log('');
  console.log('=== SETUP COMPLETE ===');
  console.log(`tenantId: ${tenantId}`);
  console.log(`cashierId: ${cashier.id}, username: testcashier`);
  console.log(`managerId: ${manager.id}, username: testmanager`);
  console.log(`walkinCustomerId: ${walkin.id}`);
  console.log(`namedCustomerId: ${namedCustomer.id}`);
  console.log(`tierCustomerId: ${tierCustomer.id}`);
  console.log(`productAId: ${productA.id}`);
  console.log(`productBId: ${productB.id}`);
  console.log(`warehouseId: ${wh.id}`);
  console.log(`pricingTierId: ${tier.id}`);
}

main()
  .catch((e) => { console.error('SETUP FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
