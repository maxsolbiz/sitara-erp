import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../src/routes';
import { generateAccessToken, hashPassword } from '../src/utils/helpers';
import { setTenantContext } from '../src/lib/prisma';

let _server: http.Server | null = null;
let _baseUrl = '';
let _app: express.Express | null = null;

export const prisma = new PrismaClient();

export let tenantId: bigint;
export let cashierUser: any, managerUser: any;
export let walkinId: bigint, namedId: bigint, tierId: bigint;
export let productAId: bigint, productBId: bigint;
export let whId: bigint;
export let vendorAId: bigint, vendorBId: bigint;
export let catUtilsId: bigint, catRentId: bigint, catSalId: bigint;
export let tierWholesaleId: bigint, tierRetailId: bigint;
export let authToken = '', cashierToken = '';

export async function setup() {
  const t = await prisma.tenant.findFirst({ where: { slug: 'test-tenant' } });
  tenantId = t!.id;
  setTenantContext({ tenantId, tenantSlug: 'test-tenant' });

  cashierUser = await prisma.user.findFirst({ where: { username: 'testcashier', tenantId } });
  managerUser = await prisma.user.findFirst({ where: { username: 'testmanager', tenantId } });
  walkinId = (await prisma.customer.findFirst({ where: { customerCode: 'WALKIN', tenantId } }))!.id;
  namedId = (await prisma.customer.findFirst({ where: { customerCode: 'TEST-NAMED', tenantId } }))!.id;
  tierId = (await prisma.customer.findFirst({ where: { customerCode: 'TEST-TIER', tenantId } }))!.id;
  productAId = (await prisma.product.findFirst({ where: { sku: 'TST-PRODA', tenantId } }))!.id;
  productBId = (await prisma.product.findFirst({ where: { sku: 'TST-PRODB', tenantId } }))!.id;
  const wh = await prisma.warehouse.findFirst({ where: { tenantId, isDefault: true } }) || await prisma.warehouse.findFirst({ where: { tenantId } });
  whId = wh!.id;
  authToken = generateAccessToken({ userId: managerUser!.id, tenantId, tenantSlug: 'test-tenant' });
  cashierToken = generateAccessToken({ userId: cashierUser!.id, tenantId, tenantSlug: 'test-tenant' });

  // Vendors
  let v = await prisma.vendor.findFirst({ where: { tenantId, code: 'VEN-A' } });
  if (!v) v = await prisma.vendor.create({ data: { tenantId, code: 'VEN-A', companyName: 'Vendor A', contactPerson: 'Ali', email: 'ali@vendor.com', phone: '0300-1111111' } });
  vendorAId = v.id;
  v = await prisma.vendor.findFirst({ where: { tenantId, code: 'VEN-B' } });
  if (!v) v = await prisma.vendor.create({ data: { tenantId, code: 'VEN-B', companyName: 'Vendor B', contactPerson: 'Bilal', email: 'bilal@vendor.com', phone: '0300-2222222' } });
  vendorBId = v.id;

  // Expense Categories
  for (const { name, desc } of [{ name: 'Utilities', desc: 'Electricity, water, gas' }, { name: 'Rent', desc: 'Office rent' }, { name: 'Salaries', desc: 'Employee salaries' }]) {
    let c = await prisma.expenseCategory.findFirst({ where: { tenantId, name } });
    if (!c) c = await prisma.expenseCategory.create({ data: { tenantId, name, description: desc } });
    if (name === 'Utilities') catUtilsId = c.id;
    if (name === 'Rent') catRentId = c.id;
    if (name === 'Salaries') catSalId = c.id;
  }

  // Pricing Tiers
  let pt = await prisma.pricingTier.findFirst({ where: { tenantId, name: 'Wholesale' } });
  if (!pt) pt = await prisma.pricingTier.create({ data: { tenantId, name: 'Wholesale', discountPercent: 10, isActive: true } });
  tierWholesaleId = pt.id;
  pt = await prisma.pricingTier.findFirst({ where: { tenantId, name: 'Retail' } });
  if (!pt) pt = await prisma.pricingTier.create({ data: { tenantId, name: 'Retail', discountPercent: 0, isActive: true } });
  tierRetailId = pt.id;

  // Setup HTTP server for API tests
  _app = express();
  _app.use(express.json());
  registerRoutes(_app);
  await new Promise<void>((resolve) => {
    _server = _app!.listen(0, () => { const a: any = _server!.address(); _baseUrl = `http://localhost:${a.port}`; resolve(); });
  });
}

export async function teardown() { _server?.close(); }

export async function api(method: string, path: string, body?: any, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, _baseUrl);
    const opts: http.RequestOptions = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json' } };
    const t = token || authToken;
    if (t) opts.headers!['Authorization'] = `Bearer ${t}`;
    const req = http.request(opts, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => { try { resolve({ status: res.statusCode || 0, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode || 0, body: {} }); } }); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

export async function apiFormData(method: string, path: string, fieldName: string, fileName: string, content: string, token?: string): Promise<{ status: number; body: any }> {
  const boundary = '----TestBoundary' + Date.now();
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`;
  const url = new URL(path, _baseUrl);
  const opts: http.RequestOptions = { hostname: url.hostname, port: url.port, path: url.pathname, method, headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': Buffer.byteLength(body).toString() } };
  const t = token || authToken;
  if (t) opts.headers!['Authorization'] = `Bearer ${t}`;
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => { try { resolve({ status: res.statusCode || 0, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode || 0, body: {} }); } }); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export function pass(name: string) { console.log(`  [PASS] ${name}`); }
export function fail(name: string, reason: string) { console.log(`  [FAIL] ${name} — ${reason}`); hasFailures = true; }
export let hasFailures = false;
