import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import { createBackup, validateBackup, requestRestoreToken, executeRestore } from '../services/backup.service';
import { parseIdParam } from '../utils/helpers';

const router = Router();

// Reject malformed numeric IDs with 400 instead of 500/P2025 downstream
// (BigInt('') silently coerces to 0n; BigInt('abc') throws).
router.param('id', (req, res, next, val) => {
  if (parseIdParam(val) === null) {
    res.status(400).json({ status: 400, title: 'Bad Request', detail: 'Invalid id parameter' });
    return;
  }
  next();
});

router.get('/', rbacMiddleware('settings.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 20;
    const skip = (page - 1) * perPage;
    const where = { tenantId: ctx.tenantId };
    const [records, total] = await Promise.all([
      prisma.backupRecord.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: perPage, include: { creator: { select: { fullName: true } }, restorer: { select: { fullName: true } } } }),
      prisma.backupRecord.count({ where }),
    ]);
    const lastCompleted = await prisma.backupRecord.findFirst({ where: { tenantId: ctx.tenantId, status: 'completed' }, orderBy: { createdAt: 'desc' } });
    const totalStorageBytes = records.filter(r => r.status === 'completed').reduce((sum, r) => sum + Number(r.fileSize), 0);
    res.json({ success: true, data: records.map(r => ({ id: r.id.toString(), filename: r.filename, fileSize: Number(r.fileSize), backupType: r.backupType, status: r.status, checksum: r.checksum, appVersion: r.appVersion, schemaVersion: r.schemaVersion, recordCounts: r.recordCounts, durationMs: r.durationMs, createdAt: r.createdAt, completedAt: r.completedAt, restoredAt: r.restoredAt, errorMessage: r.errorMessage, notes: r.notes, creator: r.creator ? { name: r.creator.fullName } : null, restorer: r.restorer ? { name: r.restorer.fullName } : null })), meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) }, stats: { lastBackupAt: lastCompleted?.completedAt || null, totalStorageMb: (totalStorageBytes / (1024 * 1024)).toFixed(1), totalBackups: total } });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/', rbacMiddleware('settings.backup'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { backupType = 'full', notes } = req.body;
    if (!['full', 'config', 'master_data', 'transactions'].includes(backupType)) { res.status(400).json({ success: false, error: 'Invalid backupType' }); return; }
    const backup = await createBackup({ tenantId: ctx.tenantId, backupType, notes, createdBy: req.user ? BigInt(req.user.userId) : undefined });
    res.json({ success: true, data: { id: backup.id.toString(), filename: backup.filename, status: backup.status, fileSize: Number(backup.fileSize), backupType: backup.backupType, durationMs: backup.durationMs, completedAt: backup.completedAt, checksum: backup.checksum, recordCounts: backup.recordCounts } });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:id/download', rbacMiddleware('settings.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const record = await prisma.backupRecord.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId } });
    if (!record) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    if (!fs.existsSync(record.storagePath)) { res.status(404).json({ success: false, error: 'File not found on disk' }); return; }
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${record.filename}"`);
    res.setHeader('Content-Length', Number(record.fileSize));
    fs.createReadStream(record.storagePath).pipe(res);
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/:id', rbacMiddleware('settings.backup'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const record = await prisma.backupRecord.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId } });
    if (!record) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    if (fs.existsSync(record.storagePath)) { fs.unlinkSync(record.storagePath); const dir = path.dirname(record.storagePath); if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); }
    await prisma.backupRecord.delete({ where: { id: BigInt(req.params.id) } });
    res.json({ success: true, message: 'Backup deleted' });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:id/validate', rbacMiddleware('settings.backup'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const owned = await prisma.backupRecord.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, select: { id: true } });
    if (!owned) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    const result = await validateBackup(parseInt(req.params.id), ctx.tenantId);
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/:id/restore/request', rbacMiddleware('settings.backup'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const owned = await prisma.backupRecord.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, select: { id: true } });
    if (!owned) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    const backupId = parseInt(req.params.id);
    const validation = await validateBackup(backupId, ctx.tenantId);
    if (!validation.valid) { res.status(422).json({ success: false, error: 'Backup failed validation', data: validation }); return; }
    const token = await requestRestoreToken(backupId);
    res.json({ success: true, data: { confirmToken: token, expiresInSeconds: 300, validationReport: validation.report, warning: 'Restoring will OVERWRITE all current data.' } });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/:id/restore/confirm', rbacMiddleware('settings.backup'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { confirmToken } = req.body;
    if (!confirmToken) { res.status(400).json({ status: 400, error: 'confirmToken required' }); return; }
    const result = await executeRestore({ backupId: parseInt(req.params.id), confirmToken, restoredBy: req.user ? BigInt(req.user.userId) : undefined, tenantId: ctx.tenantId });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// Auto-backup settings
router.get('/settings/config', rbacMiddleware('settings.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const keys = ['backup_auto_enabled','backup_frequency','backup_time','backup_retention'];
    const settings = await prisma.setting.findMany({ where: { tenantId: ctx.tenantId, key: { in: keys } } });
    const config: Record<string, string> = {};
    settings.forEach((s: any) => { config[s.key] = JSON.stringify(s.value).replace(/"/g, ''); });
    res.json({ success: true, data: config });
  } catch { res.json({ success: true, data: {} }); }
});

router.put('/settings/config', rbacMiddleware('settings.backup'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { enabled, frequency, time, retention } = req.body;
    const entries = [
      { key: 'backup_auto_enabled', value: String(enabled === true || enabled === 'true') },
      { key: 'backup_frequency', value: frequency || 'daily' },
      { key: 'backup_time', value: time || '02:00' },
      { key: 'backup_retention', value: String(parseInt(retention) || 30) },
    ];
    for (const e of entries) {
      await prisma.setting.upsert({ where: { tenantId_key: { tenantId: ctx.tenantId, key: e.key } }, update: { value: e.value }, create: { tenantId: ctx.tenantId, key: e.key, value: e.value } });
    }
    res.json({ success: true, message: 'Auto-backup settings saved' });
  } catch { res.status(500).json({ success: false, error: 'Failed to save' }); }
});

export default router;
