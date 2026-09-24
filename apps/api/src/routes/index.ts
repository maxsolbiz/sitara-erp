import { Express, Request, Response } from 'express';
import { config } from '../config';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { userRateLimitMiddleware } from '../middleware/rateLimit';

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
  const userRateLimit = userRateLimitMiddleware();

  // Public routes (no auth)
  app.get(`${api}/public/receipts/:id`, publicReceiptHandler);

  app.use(`${api}/auth`, authRoutes);
  app.use(`${api}/dashboard`, authMiddleware, tenantMiddleware, userRateLimit, dashboardRoutes);
  app.use(`${api}/tenants`, authMiddleware, userRateLimit, tenantRoutes);
  app.use(`${api}/products`, authMiddleware, tenantMiddleware, userRateLimit, productRoutes);
  app.use(`${api}/product-categories`, authMiddleware, tenantMiddleware, userRateLimit, productCategoriesRoutes);
  app.use(`${api}/pos`, authMiddleware, tenantMiddleware, userRateLimit, posRoutes);
  app.use(`${api}/sales/return-logs`, authMiddleware, tenantMiddleware, userRateLimit, returnLogsRoutes);
  app.use(`${api}/sales`, authMiddleware, tenantMiddleware, userRateLimit, saleRoutes);
  app.use(`${api}/sales-returns`, authMiddleware, tenantMiddleware, userRateLimit, salesReturnsRoutes);
  app.use(`${api}/customers`, authMiddleware, tenantMiddleware, userRateLimit, customerRoutes);
  app.use(`${api}/vendors`, authMiddleware, tenantMiddleware, userRateLimit, vendorRoutes);
  app.use(`${api}/purchases`, authMiddleware, tenantMiddleware, userRateLimit, purchaseRoutes);
  app.use(`${api}/accounting`, authMiddleware, tenantMiddleware, userRateLimit, accountingRoutes);
  app.use(`${api}/inventory`, authMiddleware, tenantMiddleware, userRateLimit, inventoryRoutes);
  app.use(`${api}/reports`, authMiddleware, tenantMiddleware, userRateLimit, reportRoutes);
  app.use(`${api}/expenses`, authMiddleware, tenantMiddleware, userRateLimit, expenseRoutes);
  app.use(`${api}/settings`, authMiddleware, tenantMiddleware, userRateLimit, settingsRoutes);
  app.use(`${api}/pricing-tiers`, authMiddleware, tenantMiddleware, userRateLimit, pricingTierRoutes);
  app.use(`${api}/users`, authMiddleware, tenantMiddleware, userRateLimit, userRoutes);
  app.use(`${api}/rbac`, authMiddleware, tenantMiddleware, userRateLimit, rbacRoutes);
  app.use(`${api}/financial-years`, authMiddleware, tenantMiddleware, userRateLimit, financialYearRoutes);
  app.use(`${api}/notifications`, authMiddleware, tenantMiddleware, userRateLimit, notificationRoutes);
  app.use(`${api}/loans`, authMiddleware, tenantMiddleware, userRateLimit, loanRoutes);
  app.use(`${api}/search`, authMiddleware, tenantMiddleware, userRateLimit, searchRoutes);
  app.use(`${api}/activity`, authMiddleware, tenantMiddleware, userRateLimit, activityRoutes);
  app.use(`${api}/ai`, authMiddleware, tenantMiddleware, userRateLimit, aiRoutes);
  app.use(`${api}/backups`, authMiddleware, tenantMiddleware, userRateLimit, backupRoutes);

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
