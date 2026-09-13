import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';

export class ReportService {
  resolveDateRange(params: { from?: string; to?: string; preset?: string }): { from: Date; to: Date } {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    const startOfMonth = new Date(y, m, 1);
    const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const startOfYear = new Date(y, 0, 1);
    const endOfYear = new Date(y, 11, 31, 23, 59, 59, 999);

    const presets: Record<string, { from: Date; to: Date }> = {
      today: { from: new Date(y, m, d), to: new Date(y, m, d, 23, 59, 59, 999) },
      yesterday: { from: new Date(y, m, d - 1), to: new Date(y, m, d - 1, 23, 59, 59, 999) },
      this_week: { from: new Date(y, m, d - now.getDay()), to: new Date(y, m, d + (6 - now.getDay()), 23, 59, 59, 999) },
      last_week: { from: new Date(y, m, d - now.getDay() - 7), to: new Date(y, m, d - now.getDay() - 1, 23, 59, 59, 999) },
      this_month: { from: startOfMonth, to: endOfMonth },
      last_month: { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59, 999) },
      this_quarter: { from: new Date(y, Math.floor(m / 3) * 3, 1), to: new Date(y, Math.floor(m / 3) * 3 + 3, 0, 23, 59, 59, 999) },
      last_quarter: { from: new Date(y, Math.floor(m / 3) * 3 - 3, 1), to: new Date(y, Math.floor(m / 3) * 3, 0, 23, 59, 59, 999) },
      this_year: { from: startOfYear, to: endOfYear },
      last_year: { from: new Date(y - 1, 0, 1), to: new Date(y - 1, 11, 31, 23, 59, 59, 999) },
    };

    if (params.preset && presets[params.preset]) return presets[params.preset];
    return { from: params.from ? new Date(params.from) : startOfMonth, to: params.to ? new Date(params.to) : endOfMonth };
  }

  protected tenantId(): bigint { const c = getTenantContext(); if (!c) throw new Error('No tenant'); return c.tenantId; }

  // ---- Sales Report ----
  async getSalesReport(params: { from: Date; to: Date; paymentMethod?: string; customerId?: bigint; page?: number; perPage?: number }) {
    const tenantId = this.tenantId();
    const page = params.page || 1, perPage = Math.min(params.perPage || 50, 200);
    const where: any = { tenantId, status: 'COMPLETED', saleDate: { gte: params.from, lte: params.to } };
    if (params.customerId) where.customerId = params.customerId;

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({ where, orderBy: { saleDate: 'desc' }, skip: (page - 1) * perPage, take: perPage, include: { customer: { select: { fullName: true } }, items: { select: { quantity: true, lineTotal: true, cogsAmount: true, profitAmount: true } }, payments: { select: { paymentMethod: true, amount: true } } } }),
      prisma.sale.count({ where }),
    ]);

    let totalRevenue = 0, totalCost = 0, totalDiscount = 0, totalReturns = 0, totalReturnValue = 0;
    const paymentBreakdown: Record<string, number> = {};

    for (const s of sales) {
      const rev = Number(s.totalAmount);
      totalRevenue += rev;
      totalCost += s.items.reduce((sum, i) => sum + Number(i.cogsAmount), 0);
      totalDiscount += Number(s.discountAmount);
      for (const p of s.payments) paymentBreakdown[p.paymentMethod] = (paymentBreakdown[p.paymentMethod] || 0) + Number(p.amount);
      const returnItems = s.items.filter((i) => i.quantity < 0);
      if (returnItems.length > 0) { totalReturns += returnItems.length; totalReturnValue += returnItems.reduce((sum, i) => sum + Math.abs(Number(i.lineTotal)), 0); }
    }

    if (params.paymentMethod) {
      const filteredSales = sales.filter((s) => s.payments.some((p) => p.paymentMethod === params.paymentMethod));
      // Recalculate summary for filtered
    }

    const totalProfit = totalRevenue - totalCost;
    const voidedCount = await prisma.sale.count({ where: { tenantId, status: 'CANCELLED', saleDate: { gte: params.from, lte: params.to } } });

    return {
      summary: { totalSales: sales.length, totalRevenue, totalCost, totalProfit, profitMargin: totalRevenue > 0 ? Number(((totalProfit / totalRevenue) * 100).toFixed(1)) : 0, totalDiscount, totalReturns, totalReturnValue, netRevenue: totalRevenue - totalReturnValue, averageOrderValue: sales.length > 0 ? totalRevenue / sales.length : 0, paymentBreakdown, voidedCount },
      items: sales.map((s) => ({ saleNumber: s.saleNumber, saleDate: s.saleDate, customerName: s.customer?.fullName || 'Walk-in', itemCount: s.items.filter((i) => i.quantity > 0).length, subtotal: Number(s.subtotal), discount: Number(s.discountAmount), total: Number(s.totalAmount), paymentMethod: s.payments[0]?.paymentMethod || 'N/A', paymentStatus: s.paymentStatus, profit: s.items.reduce((sum, i) => sum + Number(i.profitAmount), 0) })),
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
    };
  }

  async getSalesCsv(params: { from: Date; to: Date; paymentMethod?: string; customerId?: bigint }) {
    const tenantId = this.tenantId();
    const where: any = { tenantId, status: 'COMPLETED', saleDate: { gte: params.from, lte: params.to } };
    if (params.customerId) where.customerId = params.customerId;
    const sales = await prisma.sale.findMany({ where, orderBy: { saleDate: 'desc' }, include: { customer: { select: { fullName: true } }, items: { select: { quantity: true, lineTotal: true, cogsAmount: true, profitAmount: true } }, payments: { select: { paymentMethod: true } } } });
    const rows = [['Sale #','Date','Customer','Items','Subtotal','Discount','Total','Payment Method','Status','Profit'].join(',')];
    for (const s of sales) {
      const items = s.items.filter((i) => i.quantity > 0).length;
      const profit = s.items.reduce((sum, i) => sum + Number(i.profitAmount), 0);
      rows.push([s.saleNumber, s.saleDate.toISOString().slice(0,10), `"${s.customer?.fullName || 'Walk-in'}"`, items, Number(s.subtotal), Number(s.discountAmount), Number(s.totalAmount), s.payments[0]?.paymentMethod || '', s.paymentStatus, profit].join(','));
    }
    return rows.join('\n');
  }

  // ---- Purchase Report ----
  async getPurchaseReport(params: { from: Date; to: Date; vendorId?: bigint; status?: string; page?: number; perPage?: number }) {
    const tenantId = this.tenantId();
    const page = params.page || 1, perPage = Math.min(params.perPage || 50, 200);
    const where: any = { tenantId, orderDate: { gte: params.from, lte: params.to } };
    if (params.vendorId) where.vendorId = params.vendorId;
    if (params.status) where.status = params.status;

    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({ where, orderBy: { orderDate: 'desc' }, skip: (page - 1) * perPage, take: perPage, include: { vendor: { select: { companyName: true } }, items: true } }),
      prisma.purchaseOrder.count({ where }),
    ]);

    const totalOrderValue = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
    const received = orders.filter((o) => o.status === 'RECEIVED' || o.status === 'PARTIAL');
    const receivedValue = received.reduce((s, o) => s + Number(o.totalAmount), 0);
    const vendorMap: Record<string, { count: number; value: number }> = {};
    for (const o of orders) {
      const name = o.vendor.companyName;
      if (!vendorMap[name]) vendorMap[name] = { count: 0, value: 0 };
      vendorMap[name].count++;
      vendorMap[name].value += Number(o.totalAmount);
    }

    return {
      summary: { totalOrders: orders.length, totalOrderValue, totalReceived: received.length, totalReceivedValue: receivedValue, pendingOrders: orders.filter((o) => o.status === 'DRAFT').length, vendorBreakdown: Object.entries(vendorMap).map(([name, d]) => ({ vendorName: name, orderCount: d.count, totalValue: d.value })) },
      items: orders.map((o) => ({ orderNumber: o.orderNumber, orderDate: o.orderDate, vendorName: o.vendor.companyName, itemCount: o.items.length, totalAmount: Number(o.totalAmount), status: o.status })),
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
    };
  }

  async getPurchaseCsv(params: { from: Date; to: Date; vendorId?: bigint; status?: string }) {
    const tenantId = this.tenantId();
    const where: any = { tenantId, orderDate: { gte: params.from, lte: params.to } };
    if (params.vendorId) where.vendorId = params.vendorId;
    if (params.status) where.status = params.status;
    const orders = await prisma.purchaseOrder.findMany({ where, orderBy: { orderDate: 'desc' }, include: { vendor: { select: { companyName: true } }, items: true } });
    const rows = [['Order #','Date','Vendor','Items','Total','Status'].join(',')];
    for (const o of orders) rows.push([o.orderNumber, o.orderDate.toISOString().slice(0,10), `"${o.vendor.companyName}"`, o.items.length, Number(o.totalAmount), o.status].join(','));
    return rows.join('\n');
  }

  // ---- Inventory Report ----
  async getInventoryReport(params: { warehouseId?: bigint; categoryId?: bigint; belowReorder?: boolean; page?: number; perPage?: number }) {
    const tenantId = this.tenantId();
    const page = params.page || 1, perPage = Math.min(params.perPage || 50, 200);
    const whereStock: any = { tenantId };
    if (params.warehouseId) whereStock.warehouseId = params.warehouseId;
    const whereProd: any = { tenantId, isActive: true };
    if (params.categoryId) whereProd.categoryId = params.categoryId;

    const stocks = await prisma.warehouseStock.findMany({ where: whereStock, include: { product: { select: { id: true, name: true, sku: true, sellingPrice: true, costPrice: true, reorderLevel: true, category: { select: { name: true } } } }, warehouse: { select: { name: true } } } });

    const grouped: Record<string, any> = {};
    for (const s of stocks) {
      const pid = s.productId.toString();
      if (!grouped[pid]) grouped[pid] = { productId: pid, sku: s.product.sku, name: s.product.name, category: s.product.category?.name || '', totalStock: 0, warehouseBreakdown: [], reorderLevel: s.product.reorderLevel, averageCost: Number(s.product.costPrice), stockValue: 0, sellingPrice: Number(s.product.sellingPrice) };
      grouped[pid].totalStock += s.quantity;
      grouped[pid].warehouseBreakdown.push({ warehouseName: s.warehouse.name, quantity: s.quantity });
      grouped[pid].stockValue += s.quantity * Number(s.product.costPrice);
    }

    if (params.belowReorder) {
      const filtered: Record<string, any> = {};
      for (const [pid, g] of Object.entries(grouped)) {
        if (g.totalStock <= g.reorderLevel) filtered[pid] = g;
      }
      Object.assign(grouped, filtered);
    }

    const items = Object.values(grouped).sort((a: any, b: any) => a.name.localeCompare(b.name));
    const totalStockValue = items.reduce((s: number, i: any) => s + i.stockValue, 0);
    const belowReorderCount = items.filter((i: any) => i.totalStock <= i.reorderLevel).length;
    const outOfStockCount = items.filter((i: any) => i.totalStock === 0).length;

    const paginated = items.slice((page - 1) * perPage, page * perPage) as any[];
    return {
      summary: { totalProducts: items.length, totalStockValue, belowReorderCount, outOfStockCount },
      items: paginated.map((i: any) => ({ ...i, potentialRevenue: i.totalStock * i.sellingPrice, status: i.totalStock === 0 ? 'OUT_OF_STOCK' : i.totalStock <= i.reorderLevel ? 'LOW' : 'OK' })),
      meta: { total: items.length, page, perPage, totalPages: Math.ceil(items.length / perPage) },
    };
  }

  async getStockValuationReport(params: { warehouseId?: bigint; asOfDate?: Date }) {
    const tenantId = this.tenantId();
    const whereBatch: any = { tenantId };
    if (params.warehouseId) whereBatch.warehouseId = params.warehouseId;
    const batches = await prisma.stockBatch.findMany({ where: whereBatch, include: { product: { select: { name: true, sku: true, category: { select: { name: true } }, sellingPrice: true } }, warehouse: { select: { name: true } } } });
    let totalCost = 0, totalRetail = 0;
    const byCategory: Record<string, { qty: number; cost: number; retail: number }> = {};
    for (const b of batches) {
      const qty = b.quantityRemaining;
      const cost = qty * Number(b.unitCost);
      const retail = qty * Number(b.product.sellingPrice);
      totalCost += cost; totalRetail += retail;
      const cat = b.product.category?.name || 'Uncategorized';
      if (!byCategory[cat]) byCategory[cat] = { qty: 0, cost: 0, retail: 0 };
      byCategory[cat].qty += qty; byCategory[cat].cost += cost; byCategory[cat].retail += retail;
    }
    return { totalCost, totalRetail, potentialProfit: totalRetail - totalCost, byCategory: Object.entries(byCategory).map(([name, d]) => ({ category: name, ...d })), batches: batches.map((b) => ({ batchNumber: b.batchNumber, productName: b.product.name, sku: b.product.sku, warehouseName: b.warehouse.name, quantityRemaining: b.quantityRemaining, unitCost: Number(b.unitCost), totalCost: b.quantityRemaining * Number(b.unitCost), sellingPrice: Number(b.product.sellingPrice), totalRetail: b.quantityRemaining * Number(b.product.sellingPrice) })) };
  }

  async getInventoryCsv(params: { warehouseId?: bigint; categoryId?: bigint; belowReorder?: boolean }) {
    const report = await this.getInventoryReport({ ...params, perPage: 10000 });
    const rows = [['SKU','Product','Category','Total Stock','Reorder Level','Avg Cost','Stock Value','Selling Price','Status'].join(',')];
    for (const i of report.items) rows.push([i.sku, `"${i.name}"`, `"${i.category}"`, i.totalStock, i.reorderLevel, i.averageCost, i.stockValue, i.sellingPrice, i.status].join(','));
    return rows.join('\n');
  }

  // ---- Customer Aging Report ----
  async getCustomerAgingReport(params: { asOfDate?: Date; customerId?: bigint }) {
    const tenantId = this.tenantId();
    const asOf = params.asOfDate || new Date();
    const where: any = { tenantId, isActive: true };
    if (params.customerId) where.id = params.customerId;
    const customers = await prisma.customer.findMany({ where, select: { id: true, fullName: true, phone: true, currentBalance: true } });
    let totalOutstanding = 0;
    const buckets = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0 };
    const items: any[] = [];

    for (const c of customers) {
      const balance = Number(c.currentBalance);
      if (balance <= 0) continue;
      totalOutstanding += balance;
      // Get the oldest SALE ledger entry to determine age
      const oldest = await prisma.customerLedger.findFirst({
        where: { tenantId, customerId: c.id, type: 'SALE' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      const daysSince = oldest ? Math.floor((asOf.getTime() - oldest.createdAt.getTime()) / 86400000) : 0;
      let bucket = 'current';
      if (daysSince > 90) bucket = 'days_over_90';
      else if (daysSince > 60) bucket = 'days_61_90';
      else if (daysSince > 30) bucket = 'days_31_60';
      else if (daysSince > 0) bucket = 'days_1_30';
      buckets[bucket as keyof typeof buckets] += balance;
      items.push({ customerId: c.id.toString(), customerName: c.fullName, phone: c.phone, currentBalance: balance, ...Object.fromEntries(Object.keys(buckets).map((k) => [k, k === bucket ? balance : 0])), oldestInvoiceDate: oldest?.createdAt?.toISOString().slice(0, 10) || 'N/A' });
    }

    return { summary: { totalOutstanding, ...buckets }, items };
  }

  async getCustomersReport(params: { from: Date; to: Date; page?: number; perPage?: number }) {
    const tenantId = this.tenantId();
    const page = params.page || 1, perPage = Math.min(params.perPage || 50, 200);
    const customers = await prisma.customer.findMany({ where: { tenantId, isActive: true }, orderBy: { fullName: 'asc' }, include: { sales: { where: { status: 'COMPLETED', saleDate: { gte: params.from, lte: params.to } }, select: { totalAmount: true, items: { select: { cogsAmount: true } } } } } });
    const items = customers.map((c) => {
      const totalSales = c.sales.length;
      const totalRevenue = c.sales.reduce((s, sa) => s + Number(sa.totalAmount), 0);
      const totalCost = c.sales.reduce((s, sa) => s + sa.items.reduce((s2, i) => s2 + Number(i.cogsAmount), 0), 0);
      return { customerId: c.id.toString(), customerName: c.fullName, phone: c.phone, totalSales, totalRevenue, totalCost, profit: totalRevenue - totalCost, currentBalance: Number(c.currentBalance) };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
    return { summary: { totalCustomers: customers.length, totalRevenue: items.reduce((s, i) => s + i.totalRevenue, 0), totalProfit: items.reduce((s, i) => s + i.profit, 0) }, items: items.slice((page - 1) * perPage, page * perPage), meta: { total: items.length, page, perPage, totalPages: Math.ceil(items.length / perPage) } };
  }

  async getCustomersCsv(params: { from: Date; to: Date }) {
    const r = await this.getCustomersReport({ ...params, perPage: 10000 });
    const rows = [['Customer','Phone','Total Sales','Total Revenue','Total Cost','Profit','Balance'].join(',')];
    for (const i of r.items) rows.push([`"${i.customerName}"`, i.phone || '', i.totalSales, i.totalRevenue, i.totalCost, i.profit, i.currentBalance].join(','));
    return rows.join('\n');
  }

  // ---- Tax Summary Report ----
  async getTaxReport(params: { from: Date; to: Date; groupBy?: string }) {
    const tenantId = this.tenantId();

    const sales = await prisma.sale.findMany({
      where: { tenantId, status: 'COMPLETED', saleDate: { gte: params.from, lte: params.to } },
      select: {
        id: true,
        saleDate: true,
        items: { select: { lineTotal: true, taxRate: true } },
      },
    });

    let totalSales = 0, taxableSales = 0, exemptSales = 0;
    const byTaxRateMap = new Map<number, { rate: number; sales: number; count: Set<string> }>();
    const byMonthMap = new Map<string, { month: string; sales: number; taxAmount: number }>();

    for (const sale of sales) {
      const monthKey = sale.saleDate.toISOString().slice(0, 7);

      for (const item of sale.items) {
        const lineTotal = Number(item.lineTotal);
        const rate = Number(item.taxRate);
        totalSales += lineTotal;

        if (rate > 0) {
          taxableSales += lineTotal;

          if (!byTaxRateMap.has(rate)) byTaxRateMap.set(rate, { rate, sales: 0, count: new Set() });
          const taxEntry = byTaxRateMap.get(rate)!;
          taxEntry.sales += lineTotal;
          taxEntry.count.add(sale.id.toString());

          if (!byMonthMap.has(monthKey)) byMonthMap.set(monthKey, { month: monthKey, sales: 0, taxAmount: 0 });
          const mEntry = byMonthMap.get(monthKey)!;
          mEntry.sales += lineTotal;
          mEntry.taxAmount += lineTotal * rate / 100;
        } else {
          exemptSales += lineTotal;
        }
      }
    }

    const totalTaxCollected = Math.round(Array.from(byTaxRateMap.values()).reduce((sum, e) => sum + e.sales * e.rate / 100, 0) * 100) / 100;

    return {
      period: { from: params.from.toISOString().slice(0, 10), to: params.to.toISOString().slice(0, 10) },
      summary: {
        totalSales,
        taxableSales,
        exemptSales,
        totalTaxCollected,
        averageTaxRate: totalSales > 0 ? Number((totalTaxCollected / totalSales * 100).toFixed(1)) : 0,
      },
      byTaxRate: Array.from(byTaxRateMap.values()).map((e) => ({
        rate: e.rate,
        sales: e.sales,
        taxAmount: Math.round(e.sales * e.rate / 100 * 100) / 100,
        count: e.count.size,
      })).sort((a, b) => a.rate - b.rate),
      byMonth: Array.from(byMonthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  // ---- Expense Report ----
  async getExpenseReport(params: { from: Date; to: Date; categoryId?: bigint; status?: string; page?: number; perPage?: number }) {
    const tenantId = this.tenantId();
    const page = params.page || 1, perPage = Math.min(params.perPage || 50, 200);
    const where: any = { tenantId, expenseDate: { gte: params.from, lte: params.to }, status: { not: 'CANCELLED' } };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.status) where.status = params.status;

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({ where, orderBy: { expenseDate: 'desc' }, skip: (page - 1) * perPage, take: perPage, include: { category: { select: { name: true } } } }),
      prisma.expense.count({ where }),
    ]);

    const totalAmount = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const paidAmount = expenses.filter((e) => e.status === 'PAID').reduce((s, e) => s + Number(e.amount), 0);
    const catBreak: Record<string, { amount: number; count: number }> = {};
    for (const e of expenses) {
      const name = e.category?.name || 'Uncategorized';
      if (!catBreak[name]) catBreak[name] = { amount: 0, count: 0 };
      catBreak[name].amount += Number(e.amount); catBreak[name].count++;
    }

    return {
      summary: { totalExpenses: expenses.length, totalAmount, paidAmount, pendingAmount: totalAmount - paidAmount, categoryBreakdown: Object.entries(catBreak).map(([name, d]) => ({ categoryName: name, ...d })) },
      items: expenses.map((e) => ({ expenseNumber: e.expenseNumber, expenseDate: e.expenseDate, categoryName: e.category?.name || '', description: e.description, amount: Number(e.amount), status: e.status })),
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
    };
  }

  async getExpenseCsv(params: { from: Date; to: Date; categoryId?: bigint; status?: string }) {
    const r = await this.getExpenseReport({ ...params, perPage: 10000 });
    const rows = [['Expense #','Date','Category','Description','Amount','Status'].join(',')];
    for (const i of r.items) rows.push([i.expenseNumber, i.expenseDate.toISOString().slice(0,10), `"${i.categoryName}"`, `"${i.description}"`, i.amount, i.status].join(','));
    return rows.join('\n');
  }

  // ---- Vendors Report ----
  async getVendorsReport(params: { from: Date; to: Date; page?: number; perPage?: number }) {
    const tenantId = this.tenantId();
    const page = params.page || 1, perPage = Math.min(params.perPage || 50, 200);
    const vendors = await prisma.vendor.findMany({ where: { tenantId, isActive: true, deletedAt: null }, orderBy: { companyName: 'asc' }, include: { purchaseOrders: { where: { orderDate: { gte: params.from, lte: params.to } }, select: { totalAmount: true, status: true } }, payments: { where: { paymentDate: { gte: params.from, lte: params.to } }, select: { amount: true } } } });
    const items = vendors.map((v) => {
      const totalOrders = v.purchaseOrders.length;
      const totalPurchaseValue = v.purchaseOrders.reduce((s, po) => s + Number(po.totalAmount), 0);
      const totalPayments = v.payments.reduce((s, p) => s + Number(p.amount), 0);
      return { vendorId: v.id.toString(), vendorName: v.companyName, contactPerson: v.contactPerson, phone: v.phone, totalOrders, totalPurchaseValue, totalPayments, balance: Number(v.currentBalance) };
    }).sort((a, b) => b.totalPurchaseValue - a.totalPurchaseValue);
    return { summary: { totalVendors: vendors.length, totalPurchaseValue: items.reduce((s, i) => s + i.totalPurchaseValue, 0), totalPayments: items.reduce((s, i) => s + i.totalPayments, 0), outstandingPayables: items.reduce((s, i) => s + i.balance, 0) }, items: items.slice((page - 1) * perPage, page * perPage), meta: { total: items.length, page, perPage, totalPages: Math.ceil(items.length / perPage) } };
  }

  async getVendorsCsv(params: { from: Date; to: Date }) {
    const r = await this.getVendorsReport({ ...params, perPage: 10000 });
    const rows = [['Vendor','Contact','Phone','Orders','Purchase Value','Payments','Balance'].join(',')];
    for (const i of r.items) rows.push([`"${i.vendorName}"`, i.contactPerson || '', i.phone || '', i.totalOrders, i.totalPurchaseValue, i.totalPayments, i.balance].join(','));
    return rows.join('\n');
  }
}

export const reportService = new ReportService();
