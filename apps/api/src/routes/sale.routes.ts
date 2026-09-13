import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { saleService } from '../services/sale.service';
import { printerService } from '../services/printer.service';
import { rbacMiddleware } from '../middleware/rbac';
import { getUserScope } from '../utils/scope';
import { settingService } from '../services/setting.service';
import logger from '../utils/logger';
import { getDefaultWarehouse } from '../utils/warehouse';
import { ACCOUNT_CODES } from '../constants/accounts';

const router = Router();

router.get('/stats', rbacMiddleware('sales.view'), async (req: Request, res: Response) => {
  try {
    const scope = req.user ? await getUserScope(BigInt(req.user.userId), BigInt(req.user.tenantId)) : 'all';
    const stats = await saleService.getStats(scope === 'own' ? req.user!.userId : undefined);
    res.json({ data: stats });
  } catch { res.json({ data: { todaySales: 0, todayRevenue: 0, totalSales: 0, totalRevenue: 0, cancelledSales: 0, avgOrderValue: 0 } }); }
});

router.get('/', rbacMiddleware('sales.view'), async (req: Request, res: Response) => {
  try {
    const scope = req.user ? await getUserScope(BigInt(req.user.userId), BigInt(req.user.tenantId)) : 'all';
    const result = await saleService.list({
      search: req.query.search as string,
      status: req.query.status as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
      page: req.query.page ? Number(req.query.page) : 1,
      perPage: req.query.perPage ? Number(req.query.perPage) : 20,
      userId: scope === 'own' ? req.user!.userId : undefined,
    });
    res.json({ data: result.items, meta: { total: result.total, page: result.page, perPage: result.perPage } });
  } catch (error: any) {
    logger.error('Sale list failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Error', detail: 'Failed to load sales' });
  }
});

router.get('/export/csv', rbacMiddleware('sales.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const sales = await prisma.sale.findMany({
      where: { tenantId: ctx.tenantId, status: { notIn: ['CANCELLED'] } },
      orderBy: { saleDate: 'desc' },
      select: { saleNumber: true, saleDate: true, paymentStatus: true, totalAmount: true, paidAmount: true, customer: { select: { fullName: true } } },
    });
    const headers = ['Sale No','Customer','Date','Payment Status','Total Amount','Paid Amount','Due Amount'];
    const rows = sales.map(s => [
      s.saleNumber, s.customer?.fullName || 'Walk-in',
      s.saleDate.toISOString().slice(0, 10), s.paymentStatus,
      Number(s.totalAmount), Number(s.paidAmount),
      Number(s.totalAmount) - Number(s.paidAmount),
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sales-${new Date().toISOString().slice(0,10)}.csv"`);
    return res.send(csv);
  } catch { res.status(500).json({ status: 500, detail: 'Failed to export sales' }); }
});

router.get('/:id', rbacMiddleware('sales.view'), async (req: Request, res: Response) => {
  try {
    const sale = await saleService.getById(BigInt(req.params.id));
    if (!sale) { res.status(404).json({ status: 404, title: 'Not Found' }); return; }
    res.json({ data: sale });
  } catch (error: any) {
    res.status(500).json({ status: 500, title: 'Error', detail: 'Failed to load sale' });
  }
});

router.patch('/:id/void', rbacMiddleware('sales.void'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext();
    if (!ctx) { res.status(401).json({ status: 401, detail: 'No tenant context' }); return; }

    const sale = await prisma.sale.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      include: { items: true, payments: true },
    });

    if (!sale) { res.status(404).json({ status: 404, detail: 'Sale not found' }); return; }
    if (sale.status === 'CANCELLED') { res.status(400).json({ status: 400, detail: 'Sale is already cancelled' }); return; }
    if (sale.status !== 'COMPLETED') { res.status(400).json({ status: 400, detail: 'Only completed sales can be voided' }); return; }

    // Same-day restriction
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (sale.saleDate < today) {
      res.status(400).json({ status: 400, detail: 'Only same-day sales can be voided' }); return;
    }

    const warehouseId = await getDefaultWarehouse(ctx.tenantId);
    const creditPayments = sale.payments.filter((p) => p.paymentMethod === 'CREDIT');
    const creditPortion = creditPayments.reduce((s, p) => s + Number(p.amount), 0);
    const voidRef = `VOID-${sale.saleNumber}`;
    const voidReason = req.body?.voidReason || null;

    await prisma.$transaction(async (tx: any) => {
      // 1. Reverse stock
      for (const item of sale.items) {
        if (item.quantity > 0) {
          await tx.warehouseStock.upsert({
            where: { tenantId_warehouseId_productId: { tenantId: ctx.tenantId, warehouseId, productId: item.productId } },
            create: { tenantId: ctx.tenantId, warehouseId, productId: item.productId, quantity: item.quantity, averageCost: Number(item.unitCost) },
            update: { quantity: { increment: item.quantity } },
          });
          await tx.stockMovement.create({
            data: { tenantId: ctx.tenantId, warehouseId, productId: item.productId, movementType: 'SALE_VOID', quantity: item.quantity, unitCost: Number(item.unitCost), referenceType: 'sale', referenceId: sale.id, createdBy: req.user ? BigInt(req.user.userId) : 1 },
          });
        } else if (item.quantity < 0) {
          const qty = Math.abs(item.quantity);
          const stock = await tx.warehouseStock.findFirst({
            where: { tenantId: ctx.tenantId, warehouseId, productId: item.productId },
          });
          if (stock && stock.quantity >= qty) {
            await tx.warehouseStock.update({
              where: { id: stock.id },
              data: { quantity: { decrement: qty } },
            });
          }
          await tx.stockMovement.create({
            data: { tenantId: ctx.tenantId, warehouseId, productId: item.productId, movementType: 'SALE_VOID', quantity: -qty, unitCost: Number(item.unitCost), referenceType: 'sale', referenceId: sale.id, createdBy: req.user ? BigInt(req.user.userId) : 1 },
          });
        }
      }

      // 2. Reverse customer credit balance for CREDIT payments
      if (creditPortion > 0 && sale.customerId) {
        const cust = await tx.customer.findUnique({ where: { id: sale.customerId }, select: { currentBalance: true } });
        const before = Number(cust?.currentBalance || 0);
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { currentBalance: { decrement: creditPortion } },
        });
        await tx.customerLedger.create({
          data: {
            tenantId: ctx.tenantId, customerId: sale.customerId,
            type: 'VOID', amount: creditPortion,
            balanceBefore: before, balanceAfter: before - creditPortion,
            referenceId: sale.id, referenceType: 'sale',
            notes: `Void credit portion ${sale.saleNumber}`,
            createdBy: req.user ? BigInt(req.user.userId) : 1,
          },
        });
      }

      // 3. Also reverse any customerCredit from return > sale scenario
      if (Number(sale.totalAmount) === 0 && sale.customerId) {
        const returnExcess = sale.payments.reduce((s, p) => s + Number(p.amount), 0);
        if (returnExcess > 0) {
          const cust = await tx.customer.findUnique({ where: { id: sale.customerId }, select: { currentBalance: true } });
          const before = Number(cust?.currentBalance || 0);
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { currentBalance: { decrement: returnExcess } },
          });
          await tx.customerLedger.create({
            data: {
              tenantId: ctx.tenantId, customerId: sale.customerId,
              type: 'VOID', amount: returnExcess,
              balanceBefore: before, balanceAfter: before - returnExcess,
              referenceId: sale.id, referenceType: 'sale',
              notes: `Void return credit ${sale.saleNumber}`,
              createdBy: req.user ? BigInt(req.user.userId) : 1,
            },
          });
        }
      }

      // 4. Set sale status to CANCELLED
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: 'CANCELLED', voidReason },
      });

      // 5. Journal entry for void
      const [revenueAcct, cashAcct, bankAcct, arAcct, cogsAcct, invAcct] = await Promise.all([
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.SALES_REVENUE } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.CASH_ON_HAND } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.BANK_ACCOUNT } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.COST_OF_GOODS_SOLD } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId: ctx.tenantId, accountCode: ACCOUNT_CODES.INVENTORY } } }),
      ]);

      const lines: any[] = [];
      const cashPayments = sale.payments.filter((p) => !['CREDIT'].includes(p.paymentMethod));

      // Reversing revenue
      if (Number(sale.totalAmount) > 0 && revenueAcct) {
        lines.push({ tenantId: ctx.tenantId, accountId: revenueAcct.id, debitAmount: Number(sale.totalAmount), creditAmount: 0, description: `Void sale ${sale.saleNumber}` });
      }

      // Reversing cash/bank payments
      for (const p of cashPayments) {
        if (Number(p.amount) > 0) {
          const isBank = ['BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA'].includes(p.paymentMethod);
          const acct = isBank ? bankAcct : cashAcct;
          if (acct) {
            lines.push({ tenantId: ctx.tenantId, accountId: acct.id, debitAmount: 0, creditAmount: Number(p.amount), description: `Void ${p.paymentMethod} payment` });
          }
        }
      }

      // Reversing credit (Accounts Receivable)
      if (creditPortion > 0 && arAcct) {
        lines.push({ tenantId: ctx.tenantId, accountId: arAcct.id, debitAmount: 0, creditAmount: creditPortion, description: `Void credit portion` });
      }

      if (lines.length > 0) {
        const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debitAmount), 0);
        const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.creditAmount), 0);
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          throw new Error(`Journal entry not balanced: Dr ${totalDebit} != Cr ${totalCredit}`);
        }
        await tx.journalEntry.create({
          data: {
            tenantId: ctx.tenantId, entryNumber: voidRef, entryDate: new Date(),
            description: `Void sale ${sale.saleNumber}`,
            totalDebit, totalCredit,
            createdBy: req.user ? BigInt(req.user.userId) : 1,
            lines: { create: lines },
          },
        });
      }

      // 6. Reverse COGS — Dr Inventory, Cr COGS
      const totalCogs = sale.items.reduce((s: number, i: any) => s + Number(i.cogsAmount), 0);
      if (totalCogs > 0 && cogsAcct && invAcct) {
        await tx.journalEntry.create({
          data: {
            tenantId: ctx.tenantId, entryNumber: `VOID-COGS-${sale.saleNumber}`, entryDate: new Date(),
            description: `Reverse COGS ${sale.saleNumber}`,
            totalDebit: totalCogs, totalCredit: totalCogs,
            createdBy: req.user ? BigInt(req.user.userId) : 1,
            lines: {
              create: [
                { tenantId: ctx.tenantId, accountId: cogsAcct.id, debitAmount: 0, creditAmount: totalCogs, description: 'Reverse COGS' },
                { tenantId: ctx.tenantId, accountId: invAcct.id, debitAmount: totalCogs, creditAmount: 0, description: 'Restore inventory' },
              ],
            },
          },
        });
      }
    });

    logger.info('Sale voided', { saleNumber: sale.saleNumber, tenantId: ctx.tenantId.toString() });
    res.json({ data: { message: 'Sale voided successfully', saleNumber: sale.saleNumber } });
  } catch (error: any) {
    logger.error('Void sale failed', { error: error.message });
    res.status(500).json({ status: 500, detail: error.message });
  }
});

// POST /sales/:id/send-email — email receipt
router.post('/:id/send-email', rbacMiddleware('sales.email'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const sale = await prisma.sale.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      include: { customer: true, items: { include: { product: { select: { name: true } } } }, payments: true, tenant: { select: { settings: true, name: true } }, createdByUser: { select: { fullName: true } } },
    });
    if (!sale) { res.status(404).json({ status: 404, detail: 'Sale not found' }); return; }
    const provider = await settingService.getSetting(ctx.tenantId, 'email_service_provider', 'none');
    if (provider === 'none' || !provider) {
      res.json({ data: { sent: false, reason: 'Email service not configured. Go to Settings → Email to set up.' } }); return;
    }
    // Build HTML email
    const settings = (sale.tenant?.settings as any) || {};
    const companyName = settings?.companyName || sale.tenant?.name || 'Your Company';
    const itemsHtml = sale.items.filter((i) => i.quantity > 0).map((i) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${i.product?.name || 'Item'}</td><td style="padding:4px 8px;text-align:center;border-bottom:1px solid #eee">${i.quantity}</td><td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee">${Number(i.unitPrice).toLocaleString()}</td><td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee">${(i.quantity * Number(i.unitPrice)).toLocaleString()}</td></tr>`).join('');
    const paymentMethod = sale.payments?.[0]?.paymentMethod || 'N/A';
    const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px}h1{font-size:18px;border-bottom:2px solid #000;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin:12px 0}th{background:#f5f5f5;padding:6px 8px;text-align:left;font-size:12px}.footer{text-align:center;margin-top:20px;padding-top:12px;border-top:1px solid #ccc;font-size:11px;color:#888}</style></head><body>
    <h1>${companyName}</h1><p style="font-size:13px;color:#666">SALES RECEIPT</p>
    <p style="font-size:12px">Receipt #: <strong>${sale.saleNumber}</strong><br>Date: ${new Date(sale.saleDate).toLocaleDateString()}<br>Customer: ${sale.customer?.fullName || 'Walk-in'}</p>
    <table><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr>${itemsHtml}</table>
    <p style="text-align:right;font-size:16px;font-weight:bold">Total: ${Number(sale.totalAmount).toLocaleString()}</p>
    <p style="font-size:12px">Payment: ${paymentMethod}<br>Status: ${sale.paymentStatus}</p>
    <div class="footer"><p>Thank you for your business!</p><p style="font-size:10px">${companyName}</p></div></body></html>`;

    // Send via Resend
    const resendKey = await settingService.getSetting(ctx.tenantId, 'email_resend_api_key', '');
    const fromEmail = await settingService.getSetting(ctx.tenantId, 'email_from_address', 'noreply@sitara.pk');
    const fromName = await settingService.getSetting(ctx.tenantId, 'email_from_name', companyName);

    try {
      if (provider === 'resend' && resendKey) {
        const { Resend } = require('resend');
        const resend = new Resend(resendKey);
        await resend.emails.send({ from: `${fromName} <${fromEmail}>`, to: req.body.email, subject: req.body.subject || `Receipt ${sale.saleNumber} from ${companyName}`, html });
      }
      logger.info('Receipt email sent', { saleNumber: sale.saleNumber, email: req.body.email, tenantId: ctx.tenantId.toString() });
      res.json({ data: { sent: true, message: `Receipt sent to ${req.body.email}` } });
    } catch (sendError: any) {
      logger.error('Email send failed', { error: sendError.message });
      res.json({ data: { sent: false, reason: `Failed to send: ${sendError.message}` } });
    }
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// POST /sales/:id/print — print receipt to thermal printer
router.post('/:id/print', rbacMiddleware('sales.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const sale = await prisma.sale.findFirst({
      where: { id: BigInt(req.params.id), tenantId: ctx.tenantId },
      include: { customer: { select: { fullName: true } }, items: { include: { product: { select: { name: true } } } }, payments: true, createdByUser: { select: { fullName: true } }, tenant: { select: { settings: true } } },
    });
    if (!sale) { res.status(404).json({ status: 404, detail: 'Sale not found' }); return; }
    const result = await printerService.printReceipt(ctx.tenantId, sale);
    res.json({ data: result });
  } catch (error: any) { res.json({ data: { success: false, reason: error.message } }); }
});

// Public receipt handler — registered separately without auth middleware
export async function publicReceiptHandler(req: Request, res: Response) {
  try {
    const saleId = BigInt(req.params.id);
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, status: { in: ['COMPLETED', 'CANCELLED'] } },
      include: { customer: { select: { fullName: true } }, items: { where: { quantity: { gt: 0 } }, include: { product: { select: { name: true } } } }, payments: { select: { paymentMethod: true, amount: true } }, tenant: { select: { name: true, settings: true } } },
    });
    if (!sale) { res.status(404).json({ status: 404, detail: 'Receipt not found' }); return; }
    const settings = (sale.tenant?.settings || {}) as any;
    res.json({ data: { companyName: settings.companyName || sale.tenant?.name || 'Business', companyAddress: settings.address || '', companyPhone: settings.phone || '', companyEmail: settings.email || '', saleNumber: sale.saleNumber, saleDate: sale.saleDate, customerName: sale.customer?.fullName || 'Walk-in', items: sale.items.map((i) => ({ productName: i.product?.name || 'Item', quantity: i.quantity, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal) })), subtotal: Number(sale.subtotal), discount: Number(sale.discountAmount), total: Number(sale.totalAmount), paymentMethod: sale.payments[0]?.paymentMethod || 'N/A', paid: Number(sale.paidAmount), status: sale.status } });
  } catch { res.status(500).json({ status: 500 }); }
}

export default router;
