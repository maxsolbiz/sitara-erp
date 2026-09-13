import { Router, Request, Response } from 'express';
import prisma, { getTenantContext } from '../lib/prisma';
import { settingService } from '../services/setting.service';
import { printerService } from '../services/printer.service';
import { rbacMiddleware } from '../middleware/rbac';
import logger from '../utils/logger';

const router = Router();

router.get('/', rbacMiddleware('settings.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const settings = await settingService.getSettings(ctx.tenantId);
    const grouped: Record<string, any> = {};
    for (const [key, value] of Object.entries(settings)) {
      const category = key.includes('_') ? key.split('_')[0] : 'general';
      if (!grouped[category]) grouped[category] = {};
      grouped[category][key] = value;
    }
    res.json({ data: grouped });
  } catch { res.json({ data: {} }); }
});

router.get('/:category', rbacMiddleware('settings.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const category = req.params.category;
    const keyPrefix = `${category}_`;
    const settings = await settingService.getSettings(ctx.tenantId, keyPrefix);
    res.json({ data: settings });
  } catch { res.json({ data: {} }); }
});

router.put('/:category', rbacMiddleware('settings.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const category = req.params.category;
    const body: Record<string, any> = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key.startsWith(`${category}_`)) {
        body[key] = value;
      } else {
        body[`${category}_${key}`] = value;
      }
    }
    await settingService.upsertSettings(ctx.tenantId, body);
    // Sync to Tenant model for API consumers that read tenant.settings directly
    if (category === 'company') {
      const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
      if (tenant) {
        const ts = (tenant.settings as any) || {};
        if (body.company_name) ts.companyName = body.company_name;
        if (body.company_address) ts.address = body.company_address;
        if (body.company_phone) ts.phone = body.company_phone;
        if (body.company_email) ts.email = body.company_email;
        if (body.company_city) ts.city = body.company_city;
        await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { name: body.company_name || tenant.name, settings: ts } });
      }
    }
    logger.info('Settings updated', { category, tenantId: ctx.tenantId.toString() });
    res.json({ data: { message: `${category} settings updated` } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// Users
router.get('/users', rbacMiddleware('users.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const users = await prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, username: true, email: true, fullName: true, isActive: true, isSuperAdmin: true, status: true, lastLogin: true },
    });
    res.json({ data: users.map((u) => ({ id: u.id.toString(), username: u.username, email: u.email, fullName: u.fullName, isActive: u.isActive, isSuperAdmin: u.isSuperAdmin, status: u.status, lastLogin: u.lastLogin })) });
  } catch { res.json({ data: [] }); }
});

router.post('/users', rbacMiddleware('users.manage'), async (_req: Request, res: Response) => {
  res.status(201).json({ data: { message: 'User created' } });
});

router.put('/users/:id', rbacMiddleware('users.manage'), async (req: Request, res: Response) => {
  res.json({ data: { id: req.params.id, message: 'User updated' } });
});

router.delete('/users/:id', rbacMiddleware('users.manage'), async (req: Request, res: Response) => {
  res.json({ data: { id: req.params.id, message: 'User deleted' } });
});

router.get('/roles', rbacMiddleware('rbac.manage'), async (_req: Request, res: Response) => {
  res.json({ data: [] });
});

router.post('/roles', rbacMiddleware('rbac.manage'), async (_req: Request, res: Response) => {
  res.status(201).json({ data: { message: 'Role created' } });
});

router.put('/roles/:id/permissions', rbacMiddleware('rbac.manage'), async (_req: Request, res: Response) => {
  res.json({ data: { message: 'Permissions updated' } });
});

router.put('/users/:id/roles', rbacMiddleware('users.manage'), async (_req: Request, res: Response) => {
  res.json({ data: { message: 'User roles updated' } });
});

router.get('/backup/download', rbacMiddleware('settings.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { tenantId } = ctx;

    const [
      products, productCategories, productVariants, productImages,
      warehouses, warehouseStock, stockMovements, stockBatches, stockAdjustments,
      stockTransfers,
      barcodes, productBundles, productAttributes,
      customers, customerPayments, customerActivityLogs, customerLedgers,
      pricingTiers,
      vendors, vendorPayments, vendorActivityLogs, vendorLedgers,
      purchaseOrders, purchaseOrderItems,
      purchaseReceipts, purchaseReceiptItems,
      purchaseReturns, purchaseReturnItems,
      sales, saleItems, salePayments,
      salesReturns, salesReturnItems, returnProcessingLogs,
      expenseCategories, expenses,
      chartOfAccounts, journalEntries, journalEntryLines,
      financialYears,
      loanParties, loans, loanPayments,
      notifications, importHistory,
      settings,
    ] = await Promise.all([
      prisma.product.findMany({ where: { tenantId } }),
      prisma.productCategory.findMany({ where: { tenantId } }),
      prisma.productVariant.findMany({ where: { tenantId } }),
      prisma.productImage.findMany({ where: { tenantId } }),
      prisma.warehouse.findMany({ where: { tenantId } }),
      prisma.warehouseStock.findMany({ where: { tenantId } }),
      prisma.stockMovement.findMany({ where: { tenantId } }),
      prisma.stockBatch.findMany({ where: { tenantId } }),
      prisma.stockAdjustment.findMany({ where: { tenantId } }),
      prisma.stockTransfer.findMany({ where: { tenantId }, include: { items: true } }),
      prisma.barcode.findMany({ where: { tenantId } }),
      prisma.productBundle.findMany({ where: { tenantId }, include: { items: true } }),
      prisma.productAttribute.findMany({ where: { tenantId } }),
      prisma.customer.findMany({ where: { tenantId } }),
      prisma.customerPayment.findMany({ where: { tenantId } }),
      prisma.customerActivityLog.findMany({ where: { tenantId } }),
      prisma.customerLedger.findMany({ where: { tenantId } }),
      prisma.pricingTier.findMany({ where: { tenantId } }),
      prisma.vendor.findMany({ where: { tenantId } }),
      prisma.vendorPayment.findMany({ where: { tenantId } }),
      prisma.vendorActivityLog.findMany({ where: { tenantId } }),
      prisma.vendorLedger.findMany({ where: { tenantId } }),
      prisma.purchaseOrder.findMany({ where: { tenantId } }),
      prisma.purchaseOrderItem.findMany({ where: { tenantId } }),
      prisma.purchaseReceipt.findMany({ where: { tenantId } }),
      prisma.purchaseReceiptItem.findMany({ where: { tenantId } }),
      prisma.purchaseReturn.findMany({ where: { tenantId } }),
      prisma.purchaseReturnItem.findMany({ where: { tenantId } }),
      prisma.sale.findMany({ where: { tenantId } }),
      prisma.saleItem.findMany({ where: { tenantId } }),
      prisma.salePayment.findMany({ where: { tenantId } }),
      prisma.salesReturn.findMany({ where: { tenantId } }),
      prisma.salesReturnItem.findMany({ where: { tenantId } }),
      prisma.returnProcessingLog.findMany({ where: { tenantId } }),
      prisma.expenseCategory.findMany({ where: { tenantId } }),
      prisma.expense.findMany({ where: { tenantId } }),
      prisma.chartOfAccount.findMany({ where: { tenantId } }),
      prisma.journalEntry.findMany({ where: { tenantId } }),
      prisma.journalEntryLine.findMany({ where: { tenantId } }),
      prisma.financialYear.findMany({ where: { tenantId } }),
      prisma.loanParty.findMany({ where: { tenantId } }),
      prisma.loan.findMany({ where: { tenantId } }),
      prisma.loanPayment.findMany({ where: { tenantId } }),
      prisma.notification.findMany({ where: { tenantId } }),
      prisma.importHistory.findMany({ where: { tenantId } }),
      prisma.setting.findMany({ where: { tenantId } }),
    ]);

    const stockTransferItems = stockTransfers.flatMap(t => t.items);
    const productBundleItems = productBundles.flatMap(b => b.items);
    const backup = {
      exportedAt: new Date().toISOString(),
      tenantId: tenantId.toString(),
      data: {
        products, productCategories, productVariants, productImages,
        warehouses, warehouseStock, stockMovements, stockBatches, stockAdjustments,
        stockTransfers, stockTransferItems,
        barcodes, productBundles, productBundleItems, productAttributes,
        customers, customerPayments, customerActivityLogs, customerLedgers,
        pricingTiers,
        vendors, vendorPayments, vendorActivityLogs, vendorLedgers,
        purchaseOrders, purchaseOrderItems,
        purchaseReceipts, purchaseReceiptItems,
        purchaseReturns, purchaseReturnItems,
        sales, saleItems, salePayments,
        salesReturns, salesReturnItems, returnProcessingLogs,
        expenseCategories, expenses,
        chartOfAccounts, journalEntries, journalEntryLines,
        financialYears,
        loanParties, loans, loanPayments,
        notifications, importHistory,
        settings,
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sitara-backup-${tenantId}-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backup);
  } catch (error: any) {
    logger.error('Backup download failed', { error: error.message });
    res.status(500).json({ status: 500, detail: error.message });
  }
});

// ---- Hardware ----
router.get('/hardware', rbacMiddleware('settings.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const settings = await settingService.getSettings(ctx.tenantId, 'hardware_');
    res.json({ data: settings });
  } catch { res.json({ data: {} }); }
});

router.put('/hardware', rbacMiddleware('settings.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const body: Record<string, any> = {};
    for (const [k, v] of Object.entries(req.body)) body[k.startsWith('hardware_') ? k : `hardware_${k}`] = v;
    await settingService.upsertSettings(ctx.tenantId, body);
    res.json({ data: { message: 'Hardware settings saved' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.post('/hardware/test-print', rbacMiddleware('settings.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const result = await printerService.testPrint(ctx.tenantId);
    res.json({ data: result });
  } catch (error: any) { res.json({ data: { success: false, reason: error.message } }); }
});

router.post('/hardware/open-drawer', rbacMiddleware('settings.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const result = await printerService.openDrawer(ctx.tenantId);
    res.json({ data: result });
  } catch (error: any) { res.json({ data: { success: false, reason: error.message } }); }
});

router.get('/hardware/status', rbacMiddleware('settings.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const status = await printerService.checkStatus(ctx.tenantId);
    res.json({ data: status });
  } catch { res.json({ data: {} }); }
});

router.get('/exchange-rate', rbacMiddleware('settings.view'), async (_req: Request, res: Response) => {
  try {
    const { fetchUsdToPkr } = await import('../services/currency.service');
    const rate = await fetchUsdToPkr();
    res.json({ success: true, data: { usdPkr: rate, currency: 'PKR' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
