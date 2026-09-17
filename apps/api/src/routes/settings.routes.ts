import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import nodemailer from 'nodemailer';
import prisma, { getTenantContext } from '../lib/prisma';
import { settingService } from '../services/setting.service';
import { printerService } from '../services/printer.service';
import { rbacMiddleware } from '../middleware/rbac';
import { encryptSecret, decryptSecret, maskSecret, isMaskedPlaceholder } from '../utils/crypto';
import logger from '../utils/logger';

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Setting keys that hold secrets — never returned raw, stored encrypted.
const EMAIL_SECRET_KEYS = ['email_resend_api_key', 'email_smtp_pass'];

function maskEmailSecrets(settings: Record<string, any>): Record<string, any> {
  const out = { ...settings };
  for (const key of EMAIL_SECRET_KEYS) {
    const v = out[key];
    if (typeof v === 'string' && v) {
      try {
        out[key] = v.startsWith('v1:') ? maskSecret(decryptSecret(v)) : maskSecret(v);
      } catch {
        out[key] = maskSecret(v);
      }
    }
  }
  return out;
}

export const LOGO_SLOTS = ['email-header', 'invoice-pdf', 'web-app', 'receipt-print'] as const;
const LOGO_MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };

// NOTE: registered before GET /:category below, otherwise 'logos' would be
// captured as a category param (same shadowing that already affects the
// legacy /users and /roles GET endpoints defined further down).
router.get('/logos', rbacMiddleware('settings.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const out: Record<string, any> = {};
    for (const slot of LOGO_SLOTS) {
      out[slot] = await settingService.getSetting(ctx.tenantId, `logo_${slot}`, null);
    }
    res.json({ data: out });
  } catch { res.json({ data: {} }); }
});

// Multer's streaming multipart parser can detach AsyncLocalStorage context,
// so capture the tenant BEFORE upload.single() runs and prefer it in the
// handler. (Same hazard exists in product image upload — pre-existing,
// out of scope for this change; flagged separately.)
const captureTenant = (req: Request, _res: Response, next: NextFunction) => {
  (req as any).tenantCtx = getTenantContext();
  next();
};
const handlerTenant = (req: Request) => (req as any).tenantCtx || getTenantContext();

router.post('/logos/:slot', rbacMiddleware('settings.update'), captureTenant, upload.single('logo'), async (req: Request, res: Response) => {
  try {
    const ctx = handlerTenant(req); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const slot = String(req.params.slot || '');
    if (!(LOGO_SLOTS as readonly string[]).includes(slot)) {
      res.status(400).json({ status: 400, detail: `Unknown logo slot. Allowed: ${LOGO_SLOTS.join(', ')}` });
      return;
    }
    if (!req.file) { res.status(400).json({ status: 400, detail: 'No file uploaded (field name: logo)' }); return; }
    const ext = LOGO_MIME_EXT[req.file.mimetype];
    if (!ext) {
      res.status(400).json({ status: 400, detail: `Unsupported file type ${req.file.mimetype}. Allowed: image/png, image/jpeg, image/svg+xml` });
      return;
    }
    const dir = path.join('uploads', 'logos', ctx.tenantId.toString());
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${slot}.${ext}`;
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
    const meta = { path: `/uploads/logos/${ctx.tenantId}/${filename}`, mimeType: req.file.mimetype, size: req.file.size, updatedAt: new Date().toISOString() };
    await settingService.upsertSettings(ctx.tenantId, { [`logo_${slot}`]: meta });
    res.json({ data: meta });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.delete('/logos/:slot', rbacMiddleware('settings.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const slot = String(req.params.slot || '');
    if (!(LOGO_SLOTS as readonly string[]).includes(slot)) {
      res.status(400).json({ status: 400, detail: `Unknown logo slot. Allowed: ${LOGO_SLOTS.join(', ')}` });
      return;
    }
    const current: any = await settingService.getSetting(ctx.tenantId, `logo_${slot}`, null);
    await prisma.setting.deleteMany({ where: { tenantId: ctx.tenantId, key: `logo_${slot}` } });
    if (current?.path) {
      try {
        const rel = String(current.path).replace(/^\/+/, '');
        if (rel.startsWith('uploads/logos/')) fs.unlinkSync(rel);
      } catch { /* best-effort file removal */ }
    }
    res.json({ data: { message: 'Logo slot reverted to default' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.post('/email/test', rbacMiddleware('settings.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const me = req.user ? await prisma.user.findFirst({ where: { id: BigInt(req.user.userId), tenantId: ctx.tenantId }, select: { email: true } }) : null;
    if (!me?.email) { res.status(400).json({ status: 400, detail: 'No account email to send the test to' }); return; }
    // Overrides are used in-memory only and never persisted by this endpoint.
    const overrideKey = typeof req.body?.resendApiKey === 'string' && req.body.resendApiKey ? req.body.resendApiKey : null;
    const overrideFrom = typeof req.body?.fromAddress === 'string' && req.body.fromAddress ? req.body.fromAddress : null;
    let apiKey = overrideKey;
    if (!apiKey) {
      const stored = await settingService.getSetting(ctx.tenantId, 'email_resend_api_key', '');
      if (typeof stored === 'string' && stored) {
        try { apiKey = stored.startsWith('v1:') ? decryptSecret(stored) : stored; } catch { apiKey = null; }
      }
    }
    if (!apiKey) apiKey = process.env.RESEND_API_KEY || null;
    if (!apiKey) { res.status(400).json({ status: 400, detail: 'No Resend API key configured (neither override nor stored nor env)' }); return; }
    const from = overrideFrom || (await settingService.getSetting(ctx.tenantId, 'email_from_address', null)) || process.env.MAIL_FROM || 'noreply@sitarapurse.com';
    const tx = nodemailer.createTransport({ host: 'smtp.resend.com', port: 587, secure: false, auth: { user: 'resend', pass: apiKey } });
    await tx.sendMail({ from: `"Sitara ERP" <${from}>`, to: me.email, subject: 'Sitara ERP test email', html: `<p>This is a test email from Sitara ERP settings. If you received this, email delivery works.</p>` });
    res.json({ data: { message: `Test email sent to ${me.email}` } });
  } catch (error: any) {
    logger.warn('Email test send failed', { error: error.message });
    res.status(400).json({ status: 400, detail: 'Test email failed to send. Check the API key and sender domain.' });
  }
});

router.get('/', rbacMiddleware('settings.view'), async (_req: Request, res: Response) => {  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const settings = await settingService.getSettings(ctx.tenantId);
    const grouped: Record<string, any> = {};
    for (const [key, value] of Object.entries(settings)) {
      const category = key.includes('_') ? key.split('_')[0] : 'general';
      if (!grouped[category]) grouped[category] = {};
      grouped[category][key] = value;
    }
    if (grouped.email) grouped.email = maskEmailSecrets(grouped.email);
    res.json({ data: grouped });
  } catch { res.json({ data: {} }); }
});

// ---- Appearance (tenant default color theme) ----
// Explicit validated handlers registered BEFORE the generic /:category
// catch-alls below. The generic handlers would also store the key, but
// without allowlist validation.
const APPEARANCE_THEMES = ['default', 'emerald', 'amber'] as const;

router.get('/appearance', rbacMiddleware('settings.view'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const settings = await settingService.getSettings(ctx.tenantId, 'appearance_');
    res.json({ data: settings });
  } catch { res.json({ data: {} }); }
});

router.put('/appearance', rbacMiddleware('settings.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const theme = req.body?.appearance_theme ?? req.body?.theme;
    if (theme !== undefined && !(APPEARANCE_THEMES as readonly string[]).includes(String(theme))) {
      res.status(400).json({ status: 400, detail: `Unknown theme. Allowed: ${APPEARANCE_THEMES.join(', ')}` });
      return;
    }
    const body: Record<string, any> = {};
    for (const [k, v] of Object.entries(req.body)) body[k.startsWith('appearance_') ? k : `appearance_${k}`] = v;
    await settingService.upsertSettings(ctx.tenantId, body);
    logger.info('Settings updated', { category: 'appearance', tenantId: ctx.tenantId.toString() });
    res.json({ data: { message: 'Appearance settings updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.get('/:category', rbacMiddleware('settings.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const category = req.params.category;
    const keyPrefix = `${category}_`;
    const settings = await settingService.getSettings(ctx.tenantId, keyPrefix);
    res.json({ data: category === 'email' ? maskEmailSecrets(settings) : settings });
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
    if (category === 'email') {
      // Secrets are stored encrypted; a masked placeholder echoed back by
      // the UI means "unchanged" and must not overwrite the stored value.
      try {
        for (const key of EMAIL_SECRET_KEYS) {
          if (!(key in body)) continue;
          const incoming = body[key];
          if (typeof incoming !== 'string' || !incoming) { body[key] = ''; continue; }
          if (isMaskedPlaceholder(incoming)) { delete body[key]; continue; }
          body[key] = encryptSecret(incoming);
        }
      } catch {
        res.status(400).json({ status: 400, detail: 'Settings encryption is not configured on this server' });
        return;
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
