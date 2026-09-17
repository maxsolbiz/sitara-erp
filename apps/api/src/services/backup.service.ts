import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { promisify } from 'util';
import prisma from '../lib/prisma';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

function getStorageRoot(): string {
  const custom = process.env.BACKUP_STORAGE_PATH;
  if (custom) return custom;
  return path.join(process.cwd(), '..', '..', 'storage', 'backups');
}

function ensureDir(dirPath: string): void { fs.mkdirSync(dirPath, { recursive: true }); }

function sha256(buffer: Buffer): string { return crypto.createHash('sha256').update(buffer).digest('hex'); }

function getAppVersion(): string {
  try { const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')); return pkg.version || '1.0.0'; } catch { return '1.0.0'; }
}

function getSchemaVersion(): string {
  try { const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations'); const dirs = fs.readdirSync(migrationsDir).filter(d => d.match(/^\d{14}_/)).sort(); return dirs[dirs.length - 1] || 'unknown'; } catch { return 'unknown'; }
}

async function exportFullData(): Promise<{ data: Record<string, any[]>; counts: Record<string, number> }> {
  const data: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  const modelNames = ['user', 'customer', 'customerLedger', 'customerPayment', 'customerActivityLog', 'vendor', 'vendorLedger', 'vendorPayment', 'vendorActivityLog', 'product', 'productVariant', 'productImage', 'productCategory', 'warehouse', 'warehouseStock', 'stockMovement', 'stockBatch', 'stockAdjustment', 'barcode', 'productBundle', 'productAttribute', 'pricingTier', 'purchaseOrder', 'purchaseOrderItem', 'purchaseReceipt', 'purchaseReceiptItem', 'purchaseReturn', 'purchaseReturnItem', 'sale', 'saleItem', 'salePayment', 'salesReturn', 'salesReturnItem', 'returnProcessingLog', 'expenseCategory', 'expense', 'chartOfAccount', 'journalEntry', 'journalEntryLine', 'financialYear', 'loanParty', 'loan', 'loanPayment', 'setting', 'notification', 'importHistory', 'role', 'rolePermission', 'permission'];
  for (const model of modelNames) {
    try { const records = await (prisma as any)[model].findMany(); data[model] = records; counts[model] = records.length; } catch { /* skip */ }
  }
  return { data, counts };
}

async function exportPartialData(backupType: string): Promise<{ data: Record<string, any[]>; counts: Record<string, number> }> {
  const data: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  let models: string[] = [];
  if (backupType === 'config') models = ['setting', 'role', 'rolePermission', 'permission', 'pricingTier', 'financialYear'];
  else if (backupType === 'master_data') models = ['customer', 'vendor', 'product', 'productVariant', 'productImage', 'productCategory', 'warehouse', 'pricingTier'];
  else if (backupType === 'transactions') models = ['sale', 'saleItem', 'salePayment', 'salesReturn', 'salesReturnItem', 'purchaseOrder', 'purchaseOrderItem', 'purchaseReceipt', 'purchaseReceiptItem', 'purchaseReturn', 'purchaseReturnItem', 'customerLedger', 'customerPayment', 'vendorLedger', 'vendorPayment', 'expense', 'journalEntry', 'journalEntryLine'];
  for (const model of models) {
    try { const records = await (prisma as any)[model].findMany(); data[model] = records; counts[model] = records.length; } catch { /* skip */ }
  }
  return { data, counts };
}

export async function createBackup(options: { tenantId: bigint; backupType?: string; notes?: string; createdBy?: bigint }): Promise<any> {
  const { tenantId, backupType = 'full', notes, createdBy } = options;
  const startedAt = new Date();
  const record = await prisma.backupRecord.create({
    data: { tenantId, filename: 'pending', storagePath: 'pending', backupType, status: 'in_progress', appVersion: getAppVersion(), schemaVersion: getSchemaVersion(), notes, createdBy, startedAt }
  });
  try {
    const { data, counts } = backupType === 'full' ? await exportFullData() : await exportPartialData(backupType);
    const payload = { meta: { backupId: Number(record.id), backupType, appVersion: getAppVersion(), schemaVersion: getSchemaVersion(), createdAt: startedAt.toISOString(), format: 'sitara-erp-backup-v1' }, counts, data };
    const json = JSON.stringify(payload, (_, v) => typeof v === 'bigint' ? v.toString() : v);
    const jsonBuffer = Buffer.from(json, 'utf8');
    const compressed = await gzip(jsonBuffer);
    const timestamp = startedAt.toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const filename = `sitara-${backupType}-${timestamp}.json.gz`;
    const storageDir = path.join(getStorageRoot(), String(record.id));
    ensureDir(storageDir);
    const filePath = path.join(storageDir, filename);
    fs.writeFileSync(filePath, compressed);
    const checksum = sha256(compressed);
    const fileSize = BigInt(compressed.length);
    const durationMs = Date.now() - startedAt.getTime();
    const completedAt = new Date();
    const updated = await prisma.backupRecord.update({
      where: { id: record.id },
      data: { filename, storagePath: filePath, fileSize, checksum, recordCounts: counts, durationMs, status: 'completed', completedAt }
    });
    await cleanupOldBackups(30, tenantId);
    return updated;
  } catch (err: any) {
    await prisma.backupRecord.update({ where: { id: record.id }, data: { status: 'failed', errorMessage: err.message, completedAt: new Date() } });
    throw err;
  }
}

export async function validateBackup(backupId: number, tenantId: bigint): Promise<{ valid: boolean; report: any }> {
  // Tenant-scoped read (was findUnique by bare id + manual post-check).
  const record = await prisma.backupRecord.findFirst({ where: { id: BigInt(backupId), tenantId } });
  if (!record) throw new Error('Backup record not found');
  if (!fs.existsSync(record.storagePath)) throw new Error('Backup file not found on disk');
  const compressed = fs.readFileSync(record.storagePath);
  const warnings: string[] = [];
  const computedChecksum = sha256(compressed);
  const checksumOk = computedChecksum === record.checksum;
  if (!checksumOk) warnings.push('Checksum mismatch — file may be corrupted');
  const jsonBuffer = await gunzip(compressed);
  const payload = JSON.parse(jsonBuffer.toString('utf8'));
  const currentVersion = getSchemaVersion();
  const backupVersion = payload.meta?.schemaVersion || 'unknown';
  const versionMatch = currentVersion === backupVersion;
  if (!versionMatch) warnings.push(`Schema version mismatch: backup=${backupVersion}, current=${currentVersion}. Restore may fail.`);
  const counts = payload.counts || {};
  const totalRecords = Object.values(counts).reduce((a: number, b: any) => a + Number(b), 0);
  return { valid: checksumOk, report: { checksumOk, versionMatch, currentVersion, backupVersion, recordCounts: counts, totalRecords, fileSizeMb: Number(record.fileSize) / (1024 * 1024), createdAt: record.createdAt.toISOString(), warnings } };
}

const restoreTokens = new Map<string, { backupId: number; expiresAt: number }>();

export async function requestRestoreToken(backupId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  restoreTokens.set(token, { backupId, expiresAt: Date.now() + 5 * 60 * 1000 });
  return token;
}

export async function executeRestore(options: { backupId: number; confirmToken: string; restoredBy?: bigint; tenantId: bigint }): Promise<{ success: boolean; message: string; counts: Record<string, number> }> {
  const { backupId, confirmToken, restoredBy, tenantId } = options;
  const tokenData = restoreTokens.get(confirmToken);
  if (!tokenData || tokenData.backupId !== backupId) throw new Error('Invalid or expired confirmation token');
  if (tokenData.expiresAt < Date.now()) { restoreTokens.delete(confirmToken); throw new Error('Confirmation token expired'); }
  restoreTokens.delete(confirmToken);
  // Tenant-scoped read (was findUnique by bare id + manual post-check).
  const record = await prisma.backupRecord.findFirst({ where: { id: BigInt(backupId), tenantId } });
  if (!record || record.status !== 'completed') throw new Error('Backup not found or not in completed state');
  if (!fs.existsSync(record.storagePath)) throw new Error('Backup file missing from disk');
  const compressed = fs.readFileSync(record.storagePath);
  const jsonBuffer = await gunzip(compressed);
  const payload = JSON.parse(jsonBuffer.toString('utf8'));
  const deleteOrder = ['activityLog','notification','saleItem','sale','customerLedger','customerPayment','customerActivityLog','vendorLedger','vendorPayment','vendorActivityLog','salesReturnItem','salesReturn','purchaseOrderItem','purchaseOrder','purchaseReceiptItem','purchaseReceipt','purchaseReturnItem','purchaseReturn','stockTransfer','stockMovement','stockBatch','stockAdjustment','productVariant','productImage','product','productCategory','warehouseStock','warehouse','barcode','productBundle','productAttribute','customer','vendor','expense','expenseCategory','loanPayment','loan','loanParty','journalEntryLine','journalEntry','chartOfAccount','financialYear','pricingTier','setting','rolePermission','role','importHistory','notification'];
  const insertOrder = [...deleteOrder].reverse();
  const restoredCounts: Record<string, number> = {};
  for (const model of deleteOrder) {
    try { await (prisma as any)[model].deleteMany({}); } catch {}
  }
  for (const model of insertOrder) {
    const records = payload.data?.[model];
    if (!Array.isArray(records) || records.length === 0) continue;
    try {
      for (let i = 0; i < records.length; i += 100) {
        const chunk = records.slice(i, i + 100);
        await (prisma as any)[model].createMany({ data: chunk, skipDuplicates: true });
      }
      restoredCounts[model] = records.length;
    } catch { console.error(`[Restore] Failed to restore ${model}`); }
  }
  await prisma.backupRecord.update({ where: { id: record.id }, data: { restoredAt: new Date(), restoredBy } });
  return { success: true, message: 'Restore completed successfully', counts: restoredCounts };
}

async function cleanupOldBackups(keepCount: number, tenantId: bigint): Promise<void> {
  const all = await prisma.backupRecord.findMany({ where: { tenantId, status: 'completed' }, orderBy: { createdAt: 'desc' }, select: { id: true, storagePath: true } });
  const toDelete = all.slice(keepCount);
  for (const r of toDelete) {
    try {
      if (fs.existsSync(r.storagePath)) { fs.unlinkSync(r.storagePath); const dir = path.dirname(r.storagePath); if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); }
      await prisma.backupRecord.delete({ where: { id: r.id } });
    } catch {}
  }
}
