import { Router, Request, Response } from 'express';
import { getTenantContext } from '../lib/prisma';
import { reportService } from '../services/report.service';
import { rbacMiddleware } from '../middleware/rbac';
import logger from '../utils/logger';

const router = Router();

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => fn(req, res).catch((e) => {
    logger.error('Report failed', { error: (e as Error)?.message });
    res.status(500).json({ status: 500, detail: (e as Error)?.message });
  });
}

function getParams(req: Request) {
  const { from, to, preset, page, perPage } = req.query;
  const base = reportService.resolveDateRange({ from: from as string, to: to as string, preset: preset as string });
  return { ...base, page: page ? Number(page) : 1, perPage: perPage ? Number(perPage) : 50 };
}

// ---- Sales ----
router.get('/sales', rbacMiddleware('reports.sales'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const p = getParams(req);
  const result = await reportService.getSalesReport({
    from: p.from, to: p.to, page: p.page, perPage: p.perPage,
    paymentMethod: req.query.paymentMethod as string,
    customerId: req.query.customerId ? BigInt(req.query.customerId as string) : undefined,
  });
  res.json({ data: result });
}));

router.get('/sales/export', rbacMiddleware('reports.export'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const p = reportService.resolveDateRange({ from: req.query.from as string, to: req.query.to as string, preset: req.query.preset as string });
  const csv = await reportService.getSalesCsv({ from: p.from, to: p.to, paymentMethod: req.query.paymentMethod as string, customerId: req.query.customerId ? BigInt(req.query.customerId as string) : undefined });
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="sales-report-${p.from.toISOString().slice(0,10)}-${p.to.toISOString().slice(0,10)}.csv"`);
  res.send(csv);
}));

// ---- Purchases ----
router.get('/purchases', rbacMiddleware('reports.purchases'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const p = getParams(req);
  const result = await reportService.getPurchaseReport({ from: p.from, to: p.to, page: p.page, perPage: p.perPage, vendorId: req.query.vendorId ? BigInt(req.query.vendorId as string) : undefined, status: req.query.status as string });
  res.json({ data: result });
}));

router.get('/purchases/export', rbacMiddleware('reports.export'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const p = reportService.resolveDateRange({ from: req.query.from as string, to: req.query.to as string, preset: req.query.preset as string });
  const csv = await reportService.getPurchaseCsv({ from: p.from, to: p.to, vendorId: req.query.vendorId ? BigInt(req.query.vendorId as string) : undefined, status: req.query.status as string });
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="purchases-report-${p.from.toISOString().slice(0,10)}.csv"`);
  res.send(csv);
}));

// ---- Inventory ----
router.get('/inventory', rbacMiddleware('reports.inventory'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const result = await reportService.getInventoryReport({
    warehouseId: req.query.warehouseId ? BigInt(req.query.warehouseId as string) : undefined,
    categoryId: req.query.categoryId ? BigInt(req.query.categoryId as string) : undefined,
    belowReorder: req.query.belowReorder === 'true',
    page: req.query.page ? Number(req.query.page) : 1,
  });
  res.json({ data: result });
}));

router.get('/inventory/export', rbacMiddleware('reports.export'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const csv = await reportService.getInventoryCsv({
    warehouseId: req.query.warehouseId ? BigInt(req.query.warehouseId as string) : undefined,
    categoryId: req.query.categoryId ? BigInt(req.query.categoryId as string) : undefined,
    belowReorder: req.query.belowReorder === 'true',
  });
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="inventory-report.csv"'); res.send(csv);
}));

router.get('/stock-valuation', rbacMiddleware('reports.inventory'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const result = await reportService.getStockValuationReport({ warehouseId: req.query.warehouseId ? BigInt(req.query.warehouseId as string) : undefined });
  res.json({ data: result });
}));

// ---- Tax Summary ----
router.get('/tax', rbacMiddleware('reports.view'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const { from, to, groupBy } = req.query;
  const now = new Date();
  const fyYear = now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear();
  const fyStart = new Date(fyYear, 6, 1);
  const fyEnd = new Date(fyYear + 1, 6, 0, 23, 59, 59, 999);
  const startDate = from ? new Date(from as string) : fyStart;
  const endDate = to ? new Date(to as string) : fyEnd;
  const result = await reportService.getTaxReport({ from: startDate, to: endDate, groupBy: groupBy as string });
  res.json({ data: result });
}));

// ---- Customer Reports ----
router.get('/customers', rbacMiddleware('reports.view'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const p = getParams(req);
  const result = await reportService.getCustomersReport({ from: p.from, to: p.to, page: p.page, perPage: p.perPage });
  res.json({ data: result });
}));

router.get('/customers/export', rbacMiddleware('reports.export'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const p = reportService.resolveDateRange({ from: req.query.from as string, to: req.query.to as string, preset: req.query.preset as string });
  const csv = await reportService.getCustomersCsv({ from: p.from, to: p.to });
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="customers-report.csv"'); res.send(csv);
}));

router.get('/customer-aging', rbacMiddleware('reports.view'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const result = await reportService.getCustomerAgingReport({ asOfDate: req.query.asOfDate ? new Date(req.query.asOfDate as string) : undefined, customerId: req.query.customerId ? BigInt(req.query.customerId as string) : undefined });
  res.json({ data: result });
}));

// ---- Expenses ----
router.get('/expenses', rbacMiddleware('reports.view'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const p = getParams(req);
  const result = await reportService.getExpenseReport({ from: p.from, to: p.to, page: p.page, perPage: p.perPage, categoryId: req.query.categoryId ? BigInt(req.query.categoryId as string) : undefined, status: req.query.status as string });
  res.json({ data: result });
}));

router.get('/expenses/export', rbacMiddleware('reports.export'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const p = reportService.resolveDateRange({ from: req.query.from as string, to: req.query.to as string, preset: req.query.preset as string });
  const csv = await reportService.getExpenseCsv({ from: p.from, to: p.to, categoryId: req.query.categoryId ? BigInt(req.query.categoryId as string) : undefined, status: req.query.status as string });
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="expenses-report.csv"'); res.send(csv);
}));

// ---- Vendors ----
router.get('/vendors', rbacMiddleware('reports.view'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const p = getParams(req);
  const result = await reportService.getVendorsReport({ from: p.from, to: p.to, page: p.page, perPage: p.perPage });
  res.json({ data: result });
}));

router.get('/vendors/export', rbacMiddleware('reports.export'), wrap(async (req, res) => {
  const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
  const p = reportService.resolveDateRange({ from: req.query.from as string, to: req.query.to as string, preset: req.query.preset as string });
  const csv = await reportService.getVendorsCsv({ from: p.from, to: p.to });
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="vendors-report.csv"'); res.send(csv);
}));

export default router;
