import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding test data...');

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'demo' } });
  if (!tenant) { console.log('No demo tenant found. Run seed first.'); return; }
  const tid = tenant.id;

  // Warehouses
  await prisma.warehouse.upsert({ where: { tenantId_code: { tenantId: tid, code: 'WH-MAIN' } }, update: {}, create: { tenantId: tid, code: 'WH-MAIN', name: 'Main Warehouse', isDefault: true, isActive: true } });
  await prisma.warehouse.upsert({ where: { tenantId_code: { tenantId: tid, code: 'WH-NORTH' } }, update: {}, create: { tenantId: tid, code: 'WH-NORTH', name: 'North Warehouse', isActive: true } });
  const wh = await prisma.warehouse.findFirst({ where: { tenantId: tid, isDefault: true } });
  const whId = wh?.id || 1;

  // Categories
  const cats = ['Electronics', 'Clothing', 'Home & Garden', 'Food & Beverages', 'Sports'];
  const catMap: Record<string, bigint> = {};
  for (const name of cats) {
    const c = await prisma.productCategory.upsert({ where: { tenantId_name: { tenantId: tid, name } }, update: {}, create: { tenantId: tid, name, isActive: true } });
    catMap[name] = c.id;
  }

  // Products
  const productsData = [
    { name: 'iPhone 15 Pro', sku: 'ELC-IP15-001', cat: 'Electronics', cost: 350000, price: 419999, stock: 15 },
    { name: 'Samsung Galaxy S24', sku: 'ELC-SGS24-002', cat: 'Electronics', cost: 280000, price: 349999, stock: 22 },
    { name: 'Sony WH-1000XM5', sku: 'ELC-SONY-003', cat: 'Electronics', cost: 45000, price: 59999, stock: 8 },
    { name: 'Premium Cotton Shirt', sku: 'CLT-SHRT-001', cat: 'Clothing', cost: 1500, price: 2999, stock: 50 },
    { name: 'Designer Kurta', sku: 'CLT-KURT-002', cat: 'Clothing', cost: 2500, price: 4999, stock: 35 },
    { name: 'Leather Formal Shoes', sku: 'CLT-SHOE-003', cat: 'Clothing', cost: 5000, price: 8999, stock: 20 },
    { name: 'LED Desk Lamp', sku: 'HOM-LAMP-001', cat: 'Home & Garden', cost: 2000, price: 3499, stock: 45 },
    { name: 'Stainless Steel Cookware Set', sku: 'HOM-COOK-002', cat: 'Home & Garden', cost: 8000, price: 12999, stock: 12 },
    { name: 'Organic Green Tea (1kg)', sku: 'FOOD-TEA-001', cat: 'Food & Beverages', cost: 800, price: 1499, stock: 100 },
    { name: 'Premium Basmati Rice (5kg)', sku: 'FOOD-RICE-002', cat: 'Food & Beverages', cost: 1200, price: 2199, stock: 75 },
    { name: 'Tennis Racket Pro', sku: 'SPT-TENN-001', cat: 'Sports', cost: 7000, price: 11999, stock: 10 },
    { name: 'Yoga Mat Premium', sku: 'SPT-YOGA-002', cat: 'Sports', cost: 1500, price: 2999, stock: 30 },
    { name: 'Low Stock Item', sku: 'ELC-LOW-001', cat: 'Electronics', cost: 1000, price: 1999, stock: 3 },
    { name: 'Out of Stock Item', sku: 'ELC-OOS-001', cat: 'Electronics', cost: 500, price: 999, stock: 0 },
  ];
  const productIds: bigint[] = [];
  for (const p of productsData) {
    const prod = await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tid, sku: p.sku } },
      update: { sellingPrice: p.price, costPrice: p.cost },
      create: { tenantId: tid, name: p.name, sku: p.sku, barcode: p.sku, categoryId: catMap[p.cat], costPrice: p.cost, sellingPrice: p.price, unitOfMeasure: 'pieces', reorderLevel: 10, reorderQuantity: 50, isActive: true, isTrackInventory: true },
    });
    productIds.push(prod.id);
    // Set stock
    await prisma.warehouseStock.upsert({
      where: { tenantId_warehouseId_productId: { tenantId: tid, warehouseId: whId, productId: prod.id } },
      update: { quantity: p.stock },
      create: { tenantId: tid, warehouseId: whId, productId: prod.id, quantity: p.stock, averageCost: p.cost },
    });
  }
  console.log(`Products: ${productsData.length}`);

  const customerIds: bigint[] = [];

  // Walk-in customer
  const walkin = await prisma.customer.upsert({
    where: { tenantId_customerCode: { tenantId: tid, customerCode: 'WALKIN' } },
    update: {},
    create: { tenantId: tid, customerCode: 'WALKIN', fullName: 'Walk-in Customer', isActive: true },
  });
  customerIds.push(walkin.id);

  // Regular customers
  const customers = [
    { name: 'Ali Hassan', phone: '0300-1234567', email: 'ali@email.com', limit: 50000 },
    { name: 'Sana Fatima', phone: '0301-2345678', email: 'sana@email.com', limit: 30000 },
    { name: 'Usman Khan', phone: '0302-3456789', email: 'usman@email.com', limit: 75000 },
    { name: 'Ayesha Malik', phone: '0303-4567890', email: 'ayesha@email.com', limit: 25000 },
    { name: 'Bilal Ahmed', phone: '0304-5678901', email: 'bilal@email.com', limit: 100000 },
    { name: 'Zara Ali', phone: '0305-6789012', email: 'zara@email.com', limit: 15000 },
  ];
  for (const c of customers) {
    const cust = await prisma.customer.upsert({
      where: { tenantId_customerCode: { tenantId: tid, customerCode: `CUS-${c.phone.slice(-4)}` } },
      update: {},
      create: { tenantId: tid, customerCode: `CUS-${c.phone.slice(-4)}`, fullName: c.name, phone: c.phone, email: c.email, creditLimit: c.limit, isActive: true },
    });
    customerIds.push(cust.id);
  }
  console.log(`Customers: ${customers.length}`);

  // Vendors
  const vendors = [
    { name: 'Tech Distributors Pvt Ltd', person: 'Kamran Ali', phone: '042-1112233' },
    { name: 'Al-Rashid Trading Co', person: 'Rashid Mehmood', phone: '042-2223344' },
    { name: 'Premium Goods Supplier', person: 'Tariq Mahmood', phone: '042-3334455' },
  ];
  const vendorIds: bigint[] = [];
  for (const v of vendors) {
    const ven = await prisma.vendor.upsert({
      where: { tenantId_code: { tenantId: tid, code: `VEN-${v.phone.slice(-4)}` } },
      update: {},
      create: { tenantId: tid, code: `VEN-${v.phone.slice(-4)}`, companyName: v.name, contactPerson: v.person, phone: v.phone, isActive: true },
    });
    vendorIds.push(ven.id);
  }
  console.log(`Vendors: ${vendors.length}`);

  // Purchase Orders
    if (vendorIds[0]) {
    const po = await prisma.purchaseOrder.upsert({
      where: { tenantId_orderNumber: { tenantId: tid, orderNumber: 'PO-240601-0001' } },
      update: {},
      create: {
        tenantId: tid, orderNumber: 'PO-240601-0001', vendorId: vendorIds[0], orderDate: new Date('2026-06-01'),
        subtotal: 450000, totalAmount: 450000, status: 'RECEIVED', createdBy: 1,
        items: { create: [
          { tenantId: tid, productId: productIds[0], quantityOrdered: 10, quantityReceived: 10, unitCost: 350000, lineTotal: 350000 },
          { tenantId: tid, productId: productIds[1], quantityOrdered: 5, quantityReceived: 5, unitCost: 280000, lineTotal: 280000 },
        ]},
      },
    });
    console.log(`PO created: ${po.orderNumber}`);
  }

  // Sales
  if (customerIds[0]) {
    const sale = await prisma.sale.upsert({
      where: { tenantId_saleNumber: { tenantId: tid, saleNumber: 'SAL-240615-0001' } },
      update: {},
      create: {
        tenantId: tid, saleNumber: 'SAL-240615-0001', customerId: customerIds[0], saleDate: new Date('2026-06-15'),
        subtotal: 424998, totalAmount: 424998, paidAmount: 424998, status: 'COMPLETED', paymentStatus: 'PAID', createdBy: 1,
        items: { create: [
          { tenantId: tid, productId: productIds[0], quantity: 1, unitPrice: 419999, unitCost: 350000, lineTotal: 419999, cogsAmount: 350000, profitAmount: 69999 },
          { tenantId: tid, productId: productIds[2], quantity: 1, unitPrice: 59999, unitCost: 45000, lineTotal: 59999, cogsAmount: 45000, profitAmount: 14999 },
        ]},
        payments: { create: [
          { tenantId: tid, paymentMethod: 'CASH', amount: 424998, createdBy: 1 },
        ]},
      },
    });
    console.log(`Sale created: ${sale.saleNumber}`);
  }

  // Another sale
  if (customerIds[1]) {
    const sale2 = await prisma.sale.upsert({
      where: { tenantId_saleNumber: { tenantId: tid, saleNumber: 'SAL-240618-0002' } },
      update: {},
      create: {
        tenantId: tid, saleNumber: 'SAL-240618-0002', customerId: customerIds[1], saleDate: new Date('2026-06-18'),
        subtotal: 36998, totalAmount: 36998, paidAmount: 20000, status: 'COMPLETED', paymentStatus: 'PARTIAL', createdBy: 1,
        items: { create: [
          { tenantId: tid, productId: productIds[3], quantity: 5, unitPrice: 2999, unitCost: 1500, lineTotal: 14995, cogsAmount: 7500, profitAmount: 7495 },
          { tenantId: tid, productId: productIds[4], quantity: 2, unitPrice: 4999, unitCost: 2500, lineTotal: 9998, cogsAmount: 5000, profitAmount: 4998 },
          { tenantId: tid, productId: productIds[6], quantity: 3, unitPrice: 3499, unitCost: 2000, lineTotal: 10497, cogsAmount: 6000, profitAmount: 4497 },
        ]},
        payments: { create: [
          { tenantId: tid, paymentMethod: 'CASH', amount: 20000, createdBy: 1 },
        ]},
      },
    });
    console.log(`Sale created: ${sale2.saleNumber}`);
  }

  // Journal Entries for the sales (simple auto-journal)
  const cashAccount = await prisma.chartOfAccount.findFirst({ where: { tenantId: tid, accountCode: '1000' } });
  const revenueAccount = await prisma.chartOfAccount.findFirst({ where: { tenantId: tid, accountCode: '4000' } });
  const arAccount = await prisma.chartOfAccount.findFirst({ where: { tenantId: tid, accountCode: '1100' } });

  if (cashAccount && revenueAccount) {
    await prisma.journalEntry.upsert({
      where: { tenantId_entryNumber: { tenantId: tid, entryNumber: 'JE-240615-0001' } },
      update: {},
      create: {
        tenantId: tid, entryNumber: 'JE-240615-0001', entryDate: new Date('2026-06-15'),
        description: 'Sale SAL-240615-0001 - Cash sale iPhone 15 Pro + Sony WH-1000XM5',
        totalDebit: 424998, totalCredit: 424998, createdBy: 1,
        lines: { create: [
          { tenantId: tid, accountId: cashAccount.id, debitAmount: 424998, creditAmount: 0, description: 'Cash received from sale' },
          { tenantId: tid, accountId: revenueAccount.id, debitAmount: 0, creditAmount: 424998, description: 'Sales revenue' },
        ]},
      },
    });
    console.log('Journal entry created for sale 1');
  }

  if (arAccount && revenueAccount && cashAccount) {
    await prisma.journalEntry.upsert({
      where: { tenantId_entryNumber: { tenantId: tid, entryNumber: 'JE-240618-0002' } },
      update: {},
      create: {
        tenantId: tid, entryNumber: 'JE-240618-0002', entryDate: new Date('2026-06-18'),
        description: 'Sale SAL-240618-0002 - Partial payment shirts + kurta + lamp',
        totalDebit: 36998, totalCredit: 36998, createdBy: 1,
        lines: { create: [
          { tenantId: tid, accountId: cashAccount.id, debitAmount: 20000, creditAmount: 0, description: 'Partial cash payment' },
          { tenantId: tid, accountId: arAccount.id, debitAmount: 16998, creditAmount: 0, description: 'Accounts receivable - remaining' },
          { tenantId: tid, accountId: revenueAccount.id, debitAmount: 0, creditAmount: 36998, description: 'Sales revenue' },
        ]},
      },
    });
    console.log('Journal entry created for sale 2');
  }

  // Update customer balances
  if (customerIds[0]) {
    await prisma.customer.update({ where: { id: customerIds[0] }, data: { currentBalance: 424998 } });
  }
  if (customerIds[1]) {
    await prisma.customer.update({ where: { id: customerIds[1] }, data: { currentBalance: 16998 } });
  }

  console.log('\n✔ Seed complete! Test data ready.');
  console.log('  Products: 14');
  console.log('  Customers: 6');
  console.log('  Vendors: 3');
  console.log('  Purchase Orders: 1');
  console.log('  Sales: 2');
  console.log('  Journal Entries: 2');
}

main().catch(console.error).finally(() => prisma.$disconnect());
