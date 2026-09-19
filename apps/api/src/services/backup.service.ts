import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { promisify } from 'util';
import { Prisma } from '@prisma/client';
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

/**
 * Credential hygiene (urgent micro-fix, independent of tenant scoping):
 * backup files must never store authenticatable secrets. User rows are
 * exported WITHOUT passwordHash/resetToken — a backup on disk or in a
 * download must not be a credential dump. Restored users therefore get
 * an unusable password hash + mustChangePassword (see executeRestore),
 * forcing a password reset instead of silently restoring access.
 * Old backups that still contain hashes restore unchanged (their
 * validation is C-A2b's job, not this function's).
 */
const USER_CREDENTIAL_FIELDS = ['passwordHash', 'resetToken'] as const;

function stripUserCredentials<T>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const f of USER_CREDENTIAL_FIELDS) delete copy[f];
  return copy as T;
}

/**
 * Explicit per-model tenant scope for backup export (C-A2a). The Prisma
 * tenant extension cannot be relied on here: it never scopes findUnique,
 * skips RoleUser/RolePermission entirely, and is bypassed whenever the
 * ambient ALS context is absent (worker/script/test callers). Every
 * export query below goes through this helper — no bare findMany().
 * Junction models without their own tenantId resolve via their parent
 * (verified against schema.prisma relation field names).
 */
function resolveTenantScope(model: string, tenantId: bigint): Record<string, unknown> {
  switch (model) {
    case 'rolePermission':
      return { role: { tenantId } };
    case 'roleUser':
      // Pure junction table with no tenantId of its own (verified against
      // schema: only userId + roleId) — scope via the user side. Without
      // this case the default { tenantId } would throw and the catch-skip
      // would silently drop roleUser rows from every backup.
      return { user: { tenantId } };
    case 'productBundleItem':
      return { bundle: { tenantId } };
    case 'stockTransferItem':
      return { transfer: { tenantId } };
    default:
      return { tenantId };
  }
}

async function exportFullData(tenantId: bigint): Promise<{ data: Record<string, any[]>; counts: Record<string, number> }> {
  const data: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  const modelNames = ['user', 'customer', 'customerLedger', 'customerPayment', 'customerActivityLog', 'vendor', 'vendorLedger', 'vendorPayment', 'vendorActivityLog', 'product', 'productVariant', 'productImage', 'productCategory', 'warehouse', 'warehouseStock', 'stockMovement', 'stockBatch', 'stockAdjustment', 'barcode', 'productBundle', 'productBundleItem', 'productAttribute', 'pricingTier', 'purchaseOrder', 'purchaseOrderItem', 'purchaseReceipt', 'purchaseReceiptItem', 'purchaseReturn', 'purchaseReturnItem', 'sale', 'saleItem', 'salePayment', 'salesReturn', 'salesReturnItem', 'returnProcessingLog', 'expenseCategory', 'expense', 'chartOfAccount', 'journalEntry', 'journalEntryLine', 'financialYear', 'loanParty', 'loan', 'loanPayment', 'setting', 'notification', 'importHistory', 'role', 'roleUser', 'rolePermission', 'permission', 'stockTransferItem'];
  for (const model of modelNames) {
    try {
      const records = await (prisma as any)[model].findMany({ where: resolveTenantScope(model, tenantId) });
      data[model] = model === 'user' ? records.map(stripUserCredentials) : records;
      counts[model] = records.length;
    } catch { /* skip */ }
  }
  return { data, counts };
}

async function exportPartialData(tenantId: bigint, backupType: string): Promise<{ data: Record<string, any[]>; counts: Record<string, number> }> {
  const data: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  let models: string[] = [];
  // NOTE: roleUser rides with the access-control group (config); bundle /
  // transfer line items export with full backups only — the partial lists
  // are entity-scoped snapshots, and their parents aren't in them either.
  if (backupType === 'config') models = ['setting', 'role', 'roleUser', 'rolePermission', 'permission', 'pricingTier', 'financialYear'];
  else if (backupType === 'master_data') models = ['customer', 'vendor', 'product', 'productVariant', 'productImage', 'productCategory', 'warehouse', 'pricingTier'];
  else if (backupType === 'transactions') models = ['sale', 'saleItem', 'salePayment', 'salesReturn', 'salesReturnItem', 'purchaseOrder', 'purchaseOrderItem', 'purchaseReceipt', 'purchaseReceiptItem', 'purchaseReturn', 'purchaseReturnItem', 'customerLedger', 'customerPayment', 'vendorLedger', 'vendorPayment', 'expense', 'journalEntry', 'journalEntryLine'];
  for (const model of models) {
    try {
      const records = await (prisma as any)[model].findMany({ where: resolveTenantScope(model, tenantId) });
      data[model] = model === 'user' ? records.map(stripUserCredentials) : records;
      counts[model] = records.length;
    } catch { /* skip */ }
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
    const { data, counts } = backupType === 'full' ? await exportFullData(tenantId) : await exportPartialData(tenantId, backupType);
    // tenantId stamp: C-A2b's restore gate refuses payloads whose tenant
    // does not match the restoring tenant. Recorded here, at export time.
    const payload = { meta: { backupId: Number(record.id), tenantId: tenantId.toString(), backupType, appVersion: getAppVersion(), schemaVersion: getSchemaVersion(), createdAt: startedAt.toISOString(), format: 'sitara-erp-backup-v1' }, counts, data };
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

// ---- C-A2b restore hardening ----
// Generous-by-design limits: a limit breach aborts BEFORE any destructive
// write (clean failure), never mid-transaction (which would rely on
// rollback under pressure). Env-overridable; defaults assume a small VPS.
const RESTORE_TXN_TIMEOUT_MS = parseInt(process.env.RESTORE_TXN_TIMEOUT_MS || '180000', 10);
// 64MB compressed ≈ up to ~512MB parsed DOM (JSON inflates ~4-8x over gzip);
// beyond that Node risks OOM on a 3.7GB box. Streaming rewrite is the real
// fix (separate task); this gate keeps the buffered path inside safe bounds.
const RESTORE_MAX_BYTES = parseInt(process.env.RESTORE_MAX_BYTES || String(64 * 1024 * 1024), 10);
const RESTORE_MAX_ROWS = parseInt(process.env.RESTORE_MAX_ROWS || '200000', 10);

// Models restore must NEVER touch (documented, not silent):
// - tenant: the restore target itself — wiping it destroys the operation.
// - backupRecord: tracks restore history, including the in-progress one.
// - userSession: sessions must die on restore by design (forced re-auth);
//   restoring them would resurrect revoked tokens (see Phase 1).
const RESTORE_EXCLUDED_MODELS = new Set(['tenant', 'backupRecord', 'userSession']);

// Self-referencing nullable FKs (confirmed via DMMF cycle analysis — the
// ONLY cycles in the schema). Pure model-level topo-sort cannot order
// intra-table rows, so: null the self-FK before delete, restore values
// in a second pass after insert. All three columns are nullable.
const SELF_REF_FKS: Array<{ model: string; fk: string }> = [
  { model: 'productCategory', fk: 'parentId' },
  { model: 'chartOfAccount', fk: 'parentId' },
  { model: 'journalEntry', fk: 'reversedEntryId' },
];

const SELF_FK_BY_MODEL: Record<string, string> = Object.fromEntries(
  SELF_REF_FKS.map(({ model, fk }) => [model, fk])
);

function dmmfModels(): any[] {
  return Prisma.dmmf.datamodel.models as any[];
}

/**
 * FK-derived restore ordering from the live Prisma DMMF: children before
 * parents on delete, exact reverse on insert. Self-references are excluded
 * from the graph (handled by the two-pass rule above). Throws on any
 * unresolvable cycle between DIFFERENT models — never proceeds unordered.
 * Self-correcting on schema change: new models/relations flow through
 * automatically; only RESTORE_EXCLUDED_MODELS is a maintained list.
 */
export function buildRestoreOrder(): { deleteOrder: string[]; insertOrder: string[] } {
  // Exempt models leave the graph entirely (nodes and their edges).
  const excluded = new Set(
    [...RESTORE_EXCLUDED_MODELS].map((n) => n.charAt(0).toLowerCase() + n.slice(1))
  );
  const deps = new Map<string, Set<string>>();
  const names = new Set<string>();
  for (const m of dmmfModels()) {
    const delegate = m.name.charAt(0).toLowerCase() + m.name.slice(1);
    if (excluded.has(delegate)) continue;
    names.add(delegate);
    deps.set(delegate, new Set());
  }
  for (const m of dmmfModels()) {
    const delegate = m.name.charAt(0).toLowerCase() + m.name.slice(1);
    if (excluded.has(delegate)) continue;
    for (const f of m.fields) {
      if (f.kind !== 'object' || !f.relationFromFields || f.relationFromFields.length === 0) continue;
      const target = f.type.charAt(0).toLowerCase() + f.type.slice(1);
      if (target === delegate || !names.has(target)) continue; // self-ref: two-pass rule; unknown: ignore
      deps.get(delegate)!.add(target); // delegate depends on target → delete delegate first
    }
  }
  // Kahn's algorithm over "must-delete-before" edges: edge n→d means n
  // holds an FK to d, so n is deleted first. indegree(d) counts how many
  // not-yet-deleted models reference d; nodes with nothing referencing
  // them (leaf children) go first, referenced parents last.
  const indegree = new Map<string, number>();
  for (const n of names) indegree.set(n, 0);
  for (const [n, ds] of deps) for (const d of ds) indegree.set(d, (indegree.get(d) || 0) + 1);
  const deleteOrder: string[] = [];
  const queue: string[] = [...names].filter((n) => (indegree.get(n) || 0) === 0).sort();
  while (queue.length > 0) {
    queue.sort();
    const n = queue.shift()!;
    deleteOrder.push(n);
    // n is gone: every model n depended on has one fewer dependent left.
    for (const d of deps.get(n) || []) {
      indegree.set(d, (indegree.get(d) || 0) - 1);
      if (indegree.get(d) === 0) queue.push(d);
    }
  }
  if (deleteOrder.length !== names.size) {
    const stuck = [...names].filter((n) => !deleteOrder.includes(n));
    throw new Error(
      `Restore ordering failed: unresolvable FK cycle among [${stuck.join(', ')}] — refusing to proceed unordered`
    );
  }
  return { deleteOrder, insertOrder: [...deleteOrder].reverse() };
}

function payloadHasTenantField(model: string): boolean {
  const m = dmmfModels().find(
    (x) => x.name.charAt(0).toLowerCase() + x.name.slice(1) === model
  );
  return !!m && m.fields.some((f: any) => f.name === 'tenantId' && f.kind === 'scalar');
}

export async function executeRestore(options: { backupId: number; confirmToken: string; restoredBy?: bigint; tenantId: bigint }): Promise<{ success: boolean; message: string; counts: Record<string, number>; snapshotId: string }> {
  const { backupId, confirmToken, restoredBy, tenantId } = options;
  const tokenData = restoreTokens.get(confirmToken);
  if (!tokenData || tokenData.backupId !== backupId) throw new Error('Invalid or expired confirmation token');
  if (tokenData.expiresAt < Date.now()) { restoreTokens.delete(confirmToken); throw new Error('Confirmation token expired'); }
  restoreTokens.delete(confirmToken);
  if (!restoredBy) throw new Error('Missing executor identity for restore');
  // Tenant-scoped read (was findUnique by bare id + manual post-check).
  const record = await prisma.backupRecord.findFirst({ where: { id: BigInt(backupId), tenantId } });
  if (!record || record.status !== 'completed') throw new Error('Backup not found or not in completed state');
  if (!fs.existsSync(record.storagePath)) throw new Error('Backup file missing from disk');

  // Pre-flight gate (cheapest check first, buffering last): refuse
  // oversized payloads BEFORE readFileSync/gunzip/parse can spike memory.
  const onDiskBytes = fs.statSync(record.storagePath).size;
  if (onDiskBytes > RESTORE_MAX_BYTES) {
    throw new Error(`Backup too large for transactional restore (${onDiskBytes} bytes > limit ${RESTORE_MAX_BYTES})`);
  }
  const countsMeta = record.recordCounts as Record<string, unknown> | null;
  if (countsMeta && typeof countsMeta === 'object') {
    const totalRows = Object.values(countsMeta).reduce((s: number, v: any) => s + Number(v || 0), 0);
    if (totalRows > RESTORE_MAX_ROWS) {
      throw new Error(`Backup too large for transactional restore (${totalRows} rows > limit ${RESTORE_MAX_ROWS})`);
    }
  }

  const compressed = fs.readFileSync(record.storagePath);
  const jsonBuffer = await gunzip(compressed);
  const payload = JSON.parse(jsonBuffer.toString('utf8'));

  // Tenant gate: the payload must belong to the restoring tenant. Checked
  // AFTER parse (meta lives inside the file) but BEFORE any destructive
  // write. C-A2a stamps meta.tenantId at export time.
  const payloadTenant = payload?.meta?.tenantId;
  if (!payloadTenant || String(payloadTenant) !== tenantId.toString()) {
    throw new Error('Backup tenant mismatch — refusing to restore a foreign backup');
  }

  const { deleteOrder, insertOrder } = buildRestoreOrder();
  const restoredCounts: Record<string, number> = {};

  // Pre-restore auto-snapshot via the fixed export path, BEFORE the first
  // destructive write and OUTSIDE the transaction below, so a failed
  // restore can itself be rolled back from. Its id is returned for lookup.
  const snapshot = await createBackup({
    tenantId,
    backupType: 'full',
    notes: `auto-pre-restore before backup ${record.id}`,
  });

  // Junction parent map for payload-consistency checks (models without
  // their own tenantId can only reference parents restored in this same
  // payload — anything else is a tampered/foreign row, rejected below).
  const payloadIds = (model: string): Set<string> =>
    new Set(((payload.data?.[model] as any[]) || []).map((r: any) => String(r?.id)));
  const JUNCTION_PARENTS: Record<string, Array<[string, string]>> = {
    roleUser: [['userId', 'user'], ['roleId', 'role']],
    rolePermission: [['roleId', 'role'], ['permissionId', 'permission']],
    productBundleItem: [['bundleId', 'productBundle'], ['productId', 'product']],
    stockTransferItem: [['transferId', 'stockTransfer'], ['productId', 'product']],
  };
  const checkJunctionParents = (model: string, rows: any[]): void => {
    const rules = JUNCTION_PARENTS[model];
    if (!rules) return;
    for (const [fk, parent] of rules) {
      const ids = payloadIds(parent);
      for (const r of rows) {
        if (!ids.has(String((r as any)?.[fk]))) {
          throw new Error(`Restore rejected: ${model} references unknown ${parent} ${String((r as any)?.[fk])}`);
        }
      }
    }
  };

  await prisma.$transaction(async (tx: any) => {
    const db = (model: string) => (tx as any)[model];
    // Self-FK null pass (two-pass rule for the three self-loops).
    for (const { model, fk } of SELF_REF_FKS) {
      await db(model).updateMany({ where: { tenantId }, data: { [fk]: null } });
    }
    for (const model of deleteOrder) {
      if (model === 'user') {
        // Self-lockout guard: never delete the executing admin's own row.
        await db(model).deleteMany({ where: { tenantId, NOT: { id: restoredBy } } });
      } else {
        await db(model).deleteMany({ where: { tenantId } });
      }
    }
    for (const model of insertOrder) {
      let records = payload.data?.[model];
      if (!Array.isArray(records) || records.length === 0) continue;
      if (model === 'user') {
        // Skip the executor row (its live hash stays); fill unusable
        // hashes for hash-less rows (see export-side strip comment).
        records = records
          .filter((r: any) => String(r?.id) !== restoredBy.toString())
          .map((r: any) => (r && !r.passwordHash
            ? { ...r, passwordHash: crypto.randomBytes(32).toString('hex'), mustChangePassword: true }
            : r));
        if (records.length === 0) continue;
      }
      // Self-FK strip (two-pass rule, insert half): null the self-reference
      // on the payload copy so intra-model insert order can never
      // FK-violate; the second pass below restores real values once all
      // rows exist. Without this, a child-listed-before-parent payload
      // would abort the whole restore under fail-loud.
      const selfFk = SELF_FK_BY_MODEL[model];
      if (selfFk) {
        records = records.map((r: any) => ({ ...r, [selfFk]: null }));
      }
      // Stamp the restoring tenant explicitly (never trust payload claims);
      // junction models carry no tenantId — verified against payload below.
      if (payloadHasTenantField(model)) {
        records = records.map((r: any) => ({ ...r, tenantId: tenantId.toString() }));
      } else {
        checkJunctionParents(model, records);
      }
      // Fail loud per model: no skipDuplicates, no swallow — any failure
      // aborts the whole transaction (rolled back) instead of reporting
      // a partial restore as success.
      for (let i = 0; i < records.length; i += 100) {
        const chunk = records.slice(i, i + 100);
        try {
          await db(model).createMany({ data: chunk });
        } catch (e: any) {
          throw new Error(`Restore failed on ${model}: ${e.message}`);
        }
      }
      restoredCounts[model] = records.length;
    }
    // Self-FK second pass: restore original values from payload data.
    for (const { model, fk } of SELF_REF_FKS) {
      const rows = payload.data?.[model];
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        if (r?.[fk] == null || r?.id == null) continue;
        await db(model).updateMany({ where: { id: r.id, tenantId }, data: { [fk]: r[fk] } });
      }
    }
    // Explicit-PK inserts desync the sequence: reset permissions to MAX+1
    // (scoped to this table only; PKs preserved so rolePermission links stay valid).
    if ((payload.data?.permission as any[])?.length > 0) {
      await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"permissions"','id'), (SELECT MAX(id) FROM "permissions"))`);
    }
    // Executor must survive: fail loud instead of reporting success.
    const executor = await db('user').findFirst({ where: { id: restoredBy, tenantId } });
    if (!executor) throw new Error('Restore aborted: executing admin no longer exists');
  }, { timeout: RESTORE_TXN_TIMEOUT_MS });

  await prisma.backupRecord.update({ where: { id: record.id }, data: { restoredAt: new Date(), restoredBy } });
  return { success: true, message: 'Restore completed successfully', counts: restoredCounts, snapshotId: snapshot.id.toString() };
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
