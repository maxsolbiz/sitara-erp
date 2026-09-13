import { Express, Request, Response } from 'express';
import { config } from '../config';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';

import authRoutes from './auth.routes';
import dashboardRoutes from './dashboard.routes';
import tenantRoutes from './tenant.routes';
import productRoutes from './product.routes';
import productCategoriesRoutes from './product-categories.routes';
import posRoutes from './pos.routes';
import saleRoutes, { publicReceiptHandler } from './sale.routes';
import salesReturnsRoutes from './sales-returns.routes';
import customerRoutes from './customer.routes';
import vendorRoutes from './vendor.routes';
import purchaseRoutes from './purchase.routes';
import accountingRoutes from './accounting.routes';
import inventoryRoutes from './inventory.routes';
import reportRoutes from './report.routes';
import settingsRoutes from './settings.routes';
import expenseRoutes from './expense.routes';
import returnLogsRoutes from './return-logs.routes';
import pricingTierRoutes from './pricing-tier.routes';
import userRoutes from './user.routes';
import rbacRoutes from './rbac.routes';
import financialYearRoutes from './financial-year.routes';
import notificationRoutes from './notification.routes';
import loanRoutes from './loan.routes';
import searchRoutes from './search.routes';
import activityRoutes from './activity.routes';
import aiRoutes from './ai.routes';
import backupRoutes from './backup.routes';

export function registerRoutes(app: Express): void {
  const api = `/${config.apiPrefix}`;

  // Public routes (no auth)
  app.get(`${api}/public/receipts/:id`, publicReceiptHandler);

  app.use(`${api}/auth`, authRoutes);
  app.use(`${api}/dashboard`, authMiddleware, tenantMiddleware, dashboardRoutes);
  app.use(`${api}/tenants`, authMiddleware, tenantRoutes);
  app.use(`${api}/products`, authMiddleware, tenantMiddleware, productRoutes);
  app.use(`${api}/product-categories`, authMiddleware, tenantMiddleware, productCategoriesRoutes);
  app.use(`${api}/pos`, authMiddleware, tenantMiddleware, posRoutes);
  app.use(`${api}/sales/return-logs`, authMiddleware, tenantMiddleware, returnLogsRoutes);
  app.use(`${api}/sales`, authMiddleware, tenantMiddleware, saleRoutes);
  app.use(`${api}/sales-returns`, authMiddleware, tenantMiddleware, salesReturnsRoutes);
  app.use(`${api}/customers`, authMiddleware, tenantMiddleware, customerRoutes);
  app.use(`${api}/vendors`, authMiddleware, tenantMiddleware, vendorRoutes);
  app.use(`${api}/purchases`, authMiddleware, tenantMiddleware, purchaseRoutes);
  app.use(`${api}/accounting`, authMiddleware, tenantMiddleware, accountingRoutes);
  app.use(`${api}/inventory`, authMiddleware, tenantMiddleware, inventoryRoutes);
  app.use(`${api}/reports`, authMiddleware, tenantMiddleware, reportRoutes);
  app.use(`${api}/expenses`, authMiddleware, tenantMiddleware, expenseRoutes);
  app.use(`${api}/settings`, authMiddleware, tenantMiddleware, settingsRoutes);
  app.use(`${api}/pricing-tiers`, authMiddleware, tenantMiddleware, pricingTierRoutes);
  app.use(`${api}/users`, authMiddleware, tenantMiddleware, userRoutes);
  app.use(`${api}/rbac`, authMiddleware, tenantMiddleware, rbacRoutes);
  app.use(`${api}/financial-years`, authMiddleware, tenantMiddleware, financialYearRoutes);
  app.use(`${api}/notifications`, authMiddleware, tenantMiddleware, notificationRoutes);
  app.use(`${api}/loans`, authMiddleware, tenantMiddleware, loanRoutes);
  app.use(`${api}/search`, authMiddleware, tenantMiddleware, searchRoutes);
  app.use(`${api}/activity`, authMiddleware, tenantMiddleware, activityRoutes);
  app.use(`${api}/ai`, authMiddleware, tenantMiddleware, aiRoutes);
  app.use(`${api}/backups`, authMiddleware, tenantMiddleware, backupRoutes);

  app.get(`/${config.apiPrefix}`, (_req: Request, res: Response) => {
    res.json({
      name: 'Sitara ERP API',
      version: '0.1.0',
      endpoints: {
        auth: `${api}/auth`,
        products: `${api}/products`,
        pos: `${api}/pos`,
        sales: `${api}/sales`,
        customers: `${api}/customers`,
        vendors: `${api}/vendors`,
        purchases: `${api}/purchases`,
        accounting: `${api}/accounting`,
        inventory: `${api}/inventory`,
        reports: `${api}/reports`,
        settings: `${api}/settings`,
      },
    });
  });
}
