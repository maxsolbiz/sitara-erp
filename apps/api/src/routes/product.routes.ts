import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { productService } from '../services/product.service';
import { validateMiddleware } from '../middleware/validate';
import { rbacMiddleware } from '../middleware/rbac';
import { generateSku } from '../utils/helpers';
import logger from '../utils/logger';
import PDFDocument from 'pdfkit';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

// Cost prices are sensitive purchasing data. Mirrors the frontend, which gates
// the cost-containing CSV export behind 'products.export': only superadmins and
// holders of 'products.export' receive costPrice fields from read endpoints.
async function canViewCost(req: Request): Promise<boolean> {
  try {
    if (!req.user) return false;
    const user = await prisma.user.findUnique({
      where: { id: BigInt(req.user.userId) },
      select: { isSuperAdmin: true },
    });
    if (user?.isSuperAdmin) return true;
    const links = await prisma.roleUser.findMany({
      where: { userId: BigInt(req.user.userId) },
      include: { role: { include: { permissions: { include: { permission: { select: { slug: true } } } } } } },
    });
    return links.some((ru) =>
      ru.role.permissions.some((rp) => rp.permission.slug === 'products.export')
    );
  } catch {
    return false;
  }
}

const productSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(50).optional(),
  barcode: z.string().max(50).optional().nullable(),
  categoryId: z.number().optional().nullable(),
  unitOfMeasure: z.string().default('pieces'),
  costPrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  taxRate: z.number().min(0).max(100).default(0),
  reorderLevel: z.number().int().min(0).default(10),
  reorderQuantity: z.number().int().min(0).default(50),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  isTrackInventory: z.boolean().default(true),
});

router.get('/stats', rbacMiddleware('products.view'), async (_req: Request, res: Response) => {
  try {
    const stats = await productService.getStats();
    res.json({ data: stats });
  } catch (error: any) {
    logger.error('Product stats failed', { error: error.message });
    res.json({ data: { totalProducts: 0, activeProducts: 0, totalStock: 0, lowStock: 0, outOfStock: 0, stockValue: 0 } });
  }
});

router.get('/', rbacMiddleware('products.view'), async (req: Request, res: Response) => {
  try {
    const result = await productService.list({
      search: req.query.search as string,
      categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
      status: req.query.status as string,
      page: req.query.page ? Number(req.query.page) : 1,
      perPage: req.query.perPage ? Number(req.query.perPage) : 20,
    });
    if (!(await canViewCost(req))) {
      for (const item of result.items as any[]) delete item.costPrice;
    }
    res.json({ data: result.items, meta: { total: result.total, page: result.page, perPage: result.perPage } });
  } catch (error: any) {
    logger.error('Product list failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Error', detail: 'Failed to load products' });
  }
});

router.get('/search', rbacMiddleware('products.view'), async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const result = await productService.list({ search: q, perPage: 20 });
    const items = result.items as any[];
    if (!(await canViewCost(req))) {
      for (const item of items) delete item.costPrice;
    }
    res.json({ data: items });
  } catch (error: any) {
    res.json({ data: [] });
  }
});

// ---- Barcode Labels ----
router.post('/barcode-labels', rbacMiddleware('products.view'), async (req: Request, res: Response) => {
  try {
    const { products, labelSize = '50x30', showPrice = true, showName = true, showSku = true, columns = 3 } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0) {
      res.status(400).json({ status: 400, detail: 'Products array is required' });
      return;
    }

    const [labelWmm, labelHmm] = labelSize.split('x').map(Number);
    const mmToPt = (mm: number) => mm * 2.83465;
    const labelW = mmToPt(labelWmm);
    const labelH = mmToPt(labelHmm);
    const pageW = 595.28, pageH = 841.89, margin = 28.35, gap = 5.67;
    const usableW = pageW - 2 * margin;
    const cols = Math.min(columns, Math.max(1, Math.floor((usableW + gap) / (labelW + gap))));
    const rows = Math.max(1, Math.floor((pageH - 2 * margin + gap) / (labelH + gap)));

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="barcode-labels.pdf"');
    doc.pipe(res);

    let col = 0, row = 0, x = margin, y = margin;
    for (const p of products) {
      const qty = p.quantity || 1;
      for (let i = 0; i < qty; i++) {
        doc.rect(x, y, labelW, labelH).stroke();
        let cy = y + 8;
        if (showName && p.name) {
          doc.fontSize(8).font('Helvetica').text(String(p.name), x + 4, cy, { width: labelW - 8, align: 'center' });
          cy += 14;
        }
        if (showSku && p.sku) {
          doc.fontSize(7).font('Helvetica').text(`SKU: ${p.sku}`, x + 4, cy, { width: labelW - 8, align: 'center' });
          cy += 11;
        }
        const code = p.barcode || p.sku || '';
        if (code) {
          try {
            const bwipjs = require('bwip-js');
            const png = await bwipjs.toBuffer({
              bcid: 'code128', text: String(code), scale: 3, height: 10, includetext: false,
            });
            const imgW = labelW - 12;
            const imgH = imgW * 0.3;
            if (cy + imgH + 4 < y + labelH) {
              doc.image(png, x + labelW / 2 - imgW / 2, cy, { width: imgW, height: imgH });
              cy += imgH + 4;
            }
          } catch {
            doc.fontSize(6).font('Courier').text(String(code), x + 4, cy, { width: labelW - 8, align: 'center' });
            cy += 9;
          }
        }
        if (showPrice && p.sellingPrice !== undefined) {
          doc.fontSize(9).font('Helvetica-Bold').text(`$${Number(p.sellingPrice).toFixed(2)}`, x + 4, cy, { width: labelW - 8, align: 'center' });
        }
        col++;
        if (col >= cols) { col = 0; row++; x = margin; y += labelH + gap; }
        else { x += labelW + gap; }
        if (row >= rows) { doc.addPage(); row = 0; y = margin; }
      }
    }
    doc.end();
  } catch (error: any) {
    logger.error('Barcode label generation failed', { error: error.message });
    res.status(500).json({ status: 500, detail: error.message });
  }
});

// ---- Import/Export (must be before /:id route) ----
router.get('/export', rbacMiddleware('products.export'), async (_req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const products = await prisma.product.findMany({ where: { tenantId: ctx.tenantId, deletedAt: null }, include: { category: { select: { name: true } } } });
    const rows = [['SKU','Name','Category','Unit of Measure','Cost Price','Selling Price','Reorder Level','Reorder Quantity','Is Active','Barcode','Description'].join(',')];
    for (const p of products) rows.push([p.sku, `"${p.name}"`, p.category?.name || '', p.unitOfMeasure, Number(p.costPrice), Number(p.sellingPrice), p.reorderLevel, p.reorderQuantity, p.isActive ? 'true' : 'false', p.barcode || '', `"${(p.description || '').replace(/"/g, '""')}"`].join(','));
    res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="products-export-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(rows.join('\n'));
  } catch { res.status(500).json({ status: 500, detail: 'Export failed' }); }
});

router.get('/import/template', rbacMiddleware('products.view'), async (_req: Request, res: Response) => {
  const csv = `SKU,Name,Category,Unit of Measure,Cost Price,Selling Price,Reorder Level,Reorder Quantity,Is Active,Barcode,Description
PRD-001,Sample Product A,Electronics,pieces,500,1000,10,50,true,123456789,This is a sample product
PRD-002,Sample Product B,Clothing,pieces,300,800,5,25,true,,Another sample`;
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="products-import-template.csv"');
  res.send(csv);
});

router.post('/import', rbacMiddleware('products.import'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    if (!req.file) { res.status(400).json({ status: 400, detail: 'CSV file required' }); return; }
    const records = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
    const results = { imported: 0, skipped: 0, errors: [] as any[], total: records.length };
    const batchSize = 100;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      await Promise.all(batch.map(async (row: any, idx: number) => {
        const rowNum = i + idx + 2; // header row + 1 = row 2
        try {
          if (!row.Name) { results.skipped++; results.errors.push({ row: rowNum, sku: row.SKU || '', reason: 'Name is required' }); return; }
          const sku = row.SKU || generateSku(row.Name, 'IMP');
          const existing = await prisma.product.findFirst({ where: { tenantId: ctx.tenantId, sku } });
          if (existing) { results.skipped++; results.errors.push({ row: rowNum, sku, reason: 'Duplicate SKU — skipped' }); return; }
          let categoryId: bigint | null = null;
          if (row.Category) {
            let cat = await prisma.productCategory.findFirst({ where: { tenantId: ctx.tenantId, name: { equals: row.Category, mode: 'insensitive' } } });
            if (!cat) cat = await prisma.productCategory.create({ data: { tenantId: ctx.tenantId, name: row.Category } });
            categoryId = cat.id;
          }
          const costPrice = parseFloat(row['Cost Price']) || 0;
          const sellingPrice = parseFloat(row['Selling Price']) || 0;
          const isActive = ['true', '1', 'yes'].includes((row['Is Active'] || 'true').toLowerCase());
          await prisma.product.create({
            data: { tenantId: ctx.tenantId, sku, name: row.Name, barcode: row.Barcode || null, categoryId, unitOfMeasure: row['Unit of Measure'] || 'pieces', costPrice, sellingPrice, reorderLevel: parseInt(row['Reorder Level']) || 10, reorderQuantity: parseInt(row['Reorder Quantity']) || 50, isActive, description: row.Description || null },
          });
          results.imported++;
        } catch (e: any) { results.skipped++; results.errors.push({ row: rowNum, sku: row.SKU || '', reason: e.message }); }
      }));
    }
    logger.info('Product import completed', { imported: results.imported, skipped: results.skipped, tenantId: ctx.tenantId.toString() });
    // Record import history
    const filename = req.file?.originalname || 'unknown.csv';
    await prisma.importHistory.create({
      data: { tenantId: ctx.tenantId, entityType: 'products', filename, totalRows: results.total, imported: results.imported, skipped: results.skipped, errors: results.errors.length, createdBy: req.user ? BigInt(req.user.userId) : null },
    }).catch(() => {}); // non-blocking
    res.json({ data: results });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.get('/import/history', async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const items = await prisma.importHistory.findMany({
      where: { tenantId: ctx.tenantId, entityType: 'products' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ data: items.map((h: any) => ({ id: h.id.toString(), filename: h.filename, totalRows: h.totalRows, imported: h.imported, skipped: h.skipped, errors: h.errors, status: h.status, createdAt: h.createdAt })) });
  } catch { res.json({ data: [] }); }
});

// ---- Product Bundles ----
router.get('/bundles', rbacMiddleware('products.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const bundles = await prisma.productBundle.findMany({ where: { tenantId: ctx.tenantId, deletedAt: null }, orderBy: { createdAt: 'desc' }, include: { items: { include: { product: { select: { name: true, sellingPrice: true } } } } } });
    res.json({ data: bundles.map((b) => ({ id: b.id.toString(), name: b.name, sku: b.sku, sellingPrice: Number(b.sellingPrice), isActive: b.isActive, itemCount: b.items.length, items: b.items.map((i) => ({ id: i.id.toString(), productId: i.productId.toString(), productName: i.product?.name, quantity: i.quantity })) })) });
  } catch { res.json({ data: [] }); }
});

router.post('/bundles', rbacMiddleware('products.create'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { name, sku, sellingPrice, description, items } = req.body;
    if (!name || !sku || !items || items.length === 0) { res.status(400).json({ status: 400, detail: 'Name, SKU, and items required' }); return; }
    const existing = await prisma.productBundle.findFirst({ where: { tenantId: ctx.tenantId, sku } });
    if (existing) { res.status(409).json({ status: 409, detail: 'SKU already exists' }); return; }
    const bundle = await prisma.productBundle.create({
      data: { tenantId: ctx.tenantId, name, sku, sellingPrice: sellingPrice || 0, description: description || null, items: { create: items.map((i: any) => ({ productId: BigInt(i.productId), quantity: i.quantity || 1 })) } },
    });
    res.status(201).json({ data: { id: bundle.id.toString(), name: bundle.name, sku: bundle.sku } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.put('/bundles/:id', rbacMiddleware('products.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { name, sellingPrice, description, items } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (sellingPrice !== undefined) data.sellingPrice = sellingPrice;
    if (description !== undefined) data.description = description;
    await prisma.$transaction(async (tx: any) => {
      if (items) await tx.productBundleItem.deleteMany({ where: { bundleId: BigInt(req.params.id) } });
      await tx.productBundle.update({ where: { id: BigInt(req.params.id) }, data });
      if (items) for (const i of items) await tx.productBundleItem.create({ data: { bundleId: BigInt(req.params.id), productId: BigInt(i.productId), quantity: i.quantity || 1 } });
    });
    res.json({ data: { message: 'Bundle updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.delete('/bundles/:id', rbacMiddleware('products.delete'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    await prisma.productBundle.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data: { deletedAt: new Date() } });
    res.json({ data: { message: 'Bundle deleted' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.patch('/bundles/:id/toggle', rbacMiddleware('products.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const bundle = await prisma.productBundle.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId } });
    if (!bundle) { res.status(404).json({ status: 404 }); return; }
    await prisma.productBundle.update({ where: { id: bundle.id }, data: { isActive: !bundle.isActive } });
    res.json({ data: { message: bundle.isActive ? 'Deactivated' : 'Activated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// ---- Product Attributes ----
router.get('/attributes', rbacMiddleware('products.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const attrs = await prisma.productAttribute.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: 'asc' } });
    res.json({ data: attrs.map((a) => ({ id: a.id.toString(), name: a.name, values: a.values, isActive: a.isActive })) });
  } catch { res.json({ data: [] }); }
});

router.post('/attributes', rbacMiddleware('products.create'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { name, values } = req.body;
    if (!name) { res.status(400).json({ status: 400, detail: 'Name required' }); return; }
    const existing = await prisma.productAttribute.findFirst({ where: { tenantId: ctx.tenantId, name: { equals: name, mode: 'insensitive' } } });
    if (existing) { res.status(409).json({ status: 409, detail: 'Attribute already exists' }); return; }
    const attr = await prisma.productAttribute.create({ data: { tenantId: ctx.tenantId, name, values: values || [] } });
    res.status(201).json({ data: { id: attr.id.toString(), name: attr.name } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.put('/attributes/:id', rbacMiddleware('products.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { name, values } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (values !== undefined) data.values = values;
    await prisma.productAttribute.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data });
    res.json({ data: { message: 'Attribute updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.delete('/attributes/:id', rbacMiddleware('products.delete'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    await prisma.productAttribute.deleteMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId } });
    res.json({ data: { message: 'Attribute deleted' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// ---- Product Variants ----
router.get('/:id/variants', rbacMiddleware('products.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const variants = await prisma.productVariant.findMany({
      where: { productId: BigInt(req.params.id), tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const showCost = await canViewCost(req);
    res.json({ data: variants.map((v) => ({ id: v.id.toString(), productId: v.productId.toString(), sku: v.sku, name: v.name, barcode: v.barcode, ...(showCost ? { costPrice: Number(v.costPrice) } : {}), sellingPrice: Number(v.sellingPrice), isActive: v.isActive })) });
  } catch { res.json({ data: [] }); }
});

router.post('/:id/variants', rbacMiddleware('products.create'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const productId = BigInt(req.params.id);
    const { sku, name, barcode, costPrice, sellingPrice } = req.body;
    if (!sku || !name) { res.status(400).json({ status: 400, detail: 'SKU and name required' }); return; }
    const exists = await prisma.productVariant.findFirst({ where: { tenantId: ctx.tenantId, sku } });
    if (exists) { res.status(409).json({ status: 409, detail: 'SKU already exists' }); return; }
    const variant = await prisma.productVariant.create({
      data: { tenantId: ctx.tenantId, productId, sku, name, barcode: barcode || null, costPrice: costPrice || 0, sellingPrice: sellingPrice || 0 },
    });
    res.status(201).json({ data: { id: variant.id.toString(), sku: variant.sku, name: variant.name } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.put('/:id/variants/:variantId', rbacMiddleware('products.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { sku, name, barcode, costPrice, sellingPrice } = req.body;
    const data: any = {};
    if (sku !== undefined) data.sku = sku;
    if (name !== undefined) data.name = name;
    if (barcode !== undefined) data.barcode = barcode;
    if (costPrice !== undefined) data.costPrice = costPrice;
    if (sellingPrice !== undefined) data.sellingPrice = sellingPrice;
    await prisma.productVariant.updateMany({ where: { id: BigInt(req.params.variantId), tenantId: ctx.tenantId }, data });
    res.json({ data: { message: 'Variant updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.delete('/:id/variants/:variantId', rbacMiddleware('products.delete'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    await prisma.productVariant.deleteMany({ where: { id: BigInt(req.params.variantId), tenantId: ctx.tenantId } });
    res.json({ data: { message: 'Variant deleted' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// ---- Product Images ----
router.get('/:id/images', rbacMiddleware('products.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const images = await prisma.productImage.findMany({
      where: { productId: BigInt(req.params.id), tenantId: ctx.tenantId },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ data: images.map((img) => ({ id: img.id.toString(), productId: img.productId.toString(), imagePath: img.imagePath, isPrimary: img.isPrimary, sortOrder: img.sortOrder, createdAt: img.createdAt })) });
  } catch { res.json({ data: [] }); }
});

router.post('/:id/images', rbacMiddleware('products.update'), upload.single('image'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const productId = BigInt(req.params.id);
    if (!req.file) { res.status(400).json({ status: 400, detail: 'Image file required' }); return; }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) { res.status(400).json({ status: 400, detail: 'Only jpg, png, webp allowed' }); return; }
    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const filename = `${req.params.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const relativePath = `/uploads/products/${ctx.tenantId}/${filename}`;
    const uploadDir = `uploads/products/${ctx.tenantId}`;
    // Ensure directory exists
    const fs = await import('fs');
    const path = await import('path');
    const fullDir = path.join(process.cwd(), uploadDir);
    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
    fs.writeFileSync(path.join(fullDir, filename), req.file.buffer);
    const count = await prisma.productImage.count({ where: { productId, tenantId: ctx.tenantId } });
    const img = await prisma.productImage.create({
      data: { tenantId: ctx.tenantId, productId, imagePath: relativePath, isPrimary: count === 0, sortOrder: count },
    });
    res.status(201).json({ data: { id: img.id.toString(), imagePath: img.imagePath, isPrimary: img.isPrimary } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.delete('/:id/images/:imageId', rbacMiddleware('products.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const img = await prisma.productImage.findFirst({ where: { id: BigInt(req.params.imageId), productId: BigInt(req.params.id), tenantId: ctx.tenantId } });
    if (!img) { res.status(404).json({ status: 404 }); return; }
    // Delete file
    const fs = await import('fs');
    const path = await import('path');
    const fullPath = path.join(process.cwd(), img.imagePath.replace(/^\//, ''));
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    await prisma.productImage.delete({ where: { id: img.id } });
    res.json({ data: { message: 'Image deleted' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.patch('/:id/images/:imageId/primary', rbacMiddleware('products.update'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const productId = BigInt(req.params.id);
    // Unset current primary
    await prisma.productImage.updateMany({ where: { productId, tenantId: ctx.tenantId, isPrimary: true }, data: { isPrimary: false } });
    // Set new primary
    await prisma.productImage.updateMany({ where: { id: BigInt(req.params.imageId), productId, tenantId: ctx.tenantId }, data: { isPrimary: true } });
    res.json({ data: { message: 'Primary image updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.get('/:id', rbacMiddleware('products.view'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(404).json({ status: 404 }); return; }
    const product = await productService.getById(BigInt(id));
    if (!product) { res.status(404).json({ status: 404 }); return; }
    if (!(await canViewCost(req))) {
      delete (product as any).costPrice;
      for (const v of ((product as any).variants || []) as any[]) delete v.costPrice;
    }
    res.json({ data: product });
  } catch { res.status(500).json({ status: 500 }); }
});

router.post('/', rbacMiddleware('products.create'), validateMiddleware(productSchema), async (req: Request, res: Response) => {
  try { const result = await productService.create(req.body); res.status(201).json({ data: result }); }
  catch (e: any) {
    if (e.code === 'P2002' || (e.message && e.message.includes('Unique constraint'))) {
      res.status(409).json({ status: 409, detail: 'Product with this SKU already exists' });
    } else {
      logger.error('Product create failed', { error: e.message });
      res.status(500).json({ status: 500, detail: e.message });
    }
  }
});

router.put('/:id', rbacMiddleware('products.update'), async (req: Request, res: Response) => {
  try { const result = await productService.update(BigInt(req.params.id), req.body); res.json({ data: result }); }
  catch (e: any) { res.status(500).json({ status: 500, detail: e.message }); }
});

router.delete('/:id', rbacMiddleware('products.delete'), async (req: Request, res: Response) => {
  try { await productService.delete(BigInt(req.params.id)); res.json({ data: { message: 'Product deleted' } }); }
  catch (e: any) { res.status(500).json({ status: 500, detail: e.message }); }
});

export default router;
