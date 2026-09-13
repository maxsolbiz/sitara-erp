'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete, downloadFile } from '@/lib/api';
import { format, formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/page-header';
import { Database, Download, Trash2, RotateCcw, Shield, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw, Settings, Calendar, HardDrive } from 'lucide-react';

interface BackupRecord {
  id: string; filename: string; fileSize: number; backupType: string; status: string;
  checksum: string; appVersion: string; schemaVersion: string;
  recordCounts: Record<string, number>; durationMs: number;
  createdAt: string; completedAt: string; restoredAt: string | null;
  errorMessage: string | null; notes: string | null;
  creator: { name: string } | null; restorer: { name: string } | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const TYPE_LABELS: Record<string, string> = { full: 'Full', config: 'Config', master_data: 'Master Data', transactions: 'Transactions' };
const STATUS_COLORS: Record<string, string> = { completed: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300', failed: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300', in_progress: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300', pending: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' };

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [backupType, setBackupType] = useState('full');
  const [notes, setNotes] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [validation, setValidation] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [confirmToken, setConfirmToken] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreStep, setRestoreStep] = useState<'none'|'validate'|'confirm'|'done'>('none');
  const [autoConfig, setAutoConfig] = useState({ enabled: false, frequency: 'daily', time: '02:00', retention: '30' });
  const [savingConfig, setSavingConfig] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet('/backups').catch(() => null);
    if (res?.data) setBackups(res.data);
    if (res?.stats) setStats(res.stats);
    setLoading(false);
  }, []);

  const loadConfig = useCallback(async () => {
    const res = await apiGet('/backups/settings/config').catch(() => null);
    if (res?.data) setAutoConfig({ enabled: res.data.backup_auto_enabled === 'true', frequency: res.data.backup_frequency || 'daily', time: res.data.backup_time || '02:00', retention: res.data.backup_retention || '30' });
  }, []);

  useEffect(() => { load(); loadConfig(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try { await apiPost('/backups', { backupType, notes }); setNotes(''); await load(); } catch {}
    finally { setCreating(false); }
  };

  const handleDelete = async (backup: BackupRecord) => {
    if (!confirm(`Delete backup from ${format(new Date(backup.createdAt), 'MMM d, yyyy HH:mm')}?`)) return;
    await apiDelete(`/backups/${backup.id}`); await load();
  };

  const handleValidate = async (backup: BackupRecord) => {
    setRestoreTarget(backup); setValidating(true); setRestoreStep('validate');
    const res = await apiGet(`/backups/${backup.id}/validate`).catch(() => null);
    setValidation(res?.data || null); setValidating(false);
  };

  const handleRequestRestore = async () => {
    if (!restoreTarget) return;
    const res = await apiPost(`/backups/${restoreTarget.id}/restore/request`, {}).catch(() => null);
    if (res?.data?.confirmToken) { setConfirmToken(res.data.confirmToken); setRestoreStep('confirm'); }
  };

  const handleConfirmRestore = async () => {
    if (confirmText !== 'RESTORE') { alert('Type RESTORE to confirm'); return; }
    setRestoring(true);
    try {
      await apiPost(`/backups/${restoreTarget?.id}/restore/confirm`, { confirmToken });
      setRestoreStep('done'); await load();
    } catch (e: any) { alert(`Restore failed: ${e.message}`); }
    finally { setRestoring(false); }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    await apiPost('/backups/settings/config', { ...autoConfig }).catch(console.error);
    setSavingConfig(false);
  };

  return (<div className="space-y-6">
    <PageHeader title="Backup &amp; Restore" description="Manage database backups and restore points">
      <Button onClick={load} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</Button>
      <Button onClick={handleCreate} disabled={creating} size="sm"><Database className="h-4 w-4 mr-1.5" />{creating ? 'Creating...' : 'Create Backup'}</Button>
    </PageHeader>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground mb-1">Last Backup</p><p className="font-semibold text-sm">{stats?.lastBackupAt ? formatDistanceToNow(new Date(stats.lastBackupAt), { addSuffix: true }) : 'Never'}</p></CardContent></Card>
      <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground mb-1">Storage Used</p><p className="font-semibold text-sm">{stats?.totalStorageMb || '0'} MB</p></CardContent></Card>
      <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground mb-1">Total Backups</p><p className="font-semibold text-sm">{stats?.totalBackups || 0}</p></CardContent></Card>
      <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground mb-1">Auto Backup</p><p className="font-semibold text-sm flex items-center gap-1.5">{autoConfig.enabled ? <><CheckCircle className="h-4 w-4 text-green-500" />Enabled</> : <><XCircle className="h-4 w-4 text-red-400" />Disabled</>}</p></CardContent></Card>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" />Create Backup</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Backup Type</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={backupType} onChange={e => setBackupType(e.target.value)}>
              <option value="full">Full Backup (All Data)</option>
              <option value="config">Configuration Only</option>
              <option value="master_data">Master Data Only</option>
              <option value="transactions">Transactions Only</option>
            </select>
          </div>
          <div className="space-y-2"><Label>Notes (optional)</Label><Input placeholder="e.g. Before migration" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <Button className="w-full" onClick={handleCreate} disabled={creating}>{creating ? <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />Creating...</> : <><Database className="h-4 w-4 mr-1.5" />Create Now</>}</Button>
          <p className="text-xs text-muted-foreground">Compressed (gzip) + SHA-256 checksum.</p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" />Auto-Backup Schedule</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between"><Label>Enable Auto-Backup</Label>
            <button onClick={() => setAutoConfig(c => ({ ...c, enabled: !c.enabled }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoConfig.enabled ? 'bg-primary' : 'bg-muted'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="space-y-2"><Label>Frequency</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={autoConfig.frequency} onChange={e => setAutoConfig(c => ({ ...c, frequency: e.target.value }))}>
              <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="manual">Manual Only</option>
            </select>
          </div>
          <div className="space-y-2"><Label>Backup Time</Label><Input type="time" value={autoConfig.time} onChange={e => setAutoConfig(c => ({ ...c, time: e.target.value }))} /></div>
          <div className="space-y-2"><Label>Retention (backups to keep)</Label><Input type="number" min="1" max="365" value={autoConfig.retention} onChange={e => setAutoConfig(c => ({ ...c, retention: e.target.value }))} /></div>
          <Button className="w-full" variant="outline" onClick={handleSaveConfig} disabled={savingConfig}><Settings className="h-4 w-4 mr-1.5" />{savingConfig ? 'Saving...' : 'Save Schedule'}</Button>
        </CardContent>
      </Card>

      {restoreStep !== 'none' && (
        <Card className="lg:col-span-1 border-orange-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2 text-orange-700"><AlertTriangle className="h-4 w-4" />Restore Wizard</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {restoreStep === 'validate' && (validating ? <div className="text-center py-4"><RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" /><p className="text-sm">Validating backup...</p></div> : validation ? <div className="space-y-3">
              <div className="space-y-1.5 text-sm"><div className="flex items-center gap-2">{validation.report?.checksumOk ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}Checksum</div><div className="flex items-center gap-2">{validation.report?.versionMatch ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />}Schema: {validation.report?.backupVersion}</div><div className="text-muted-foreground text-xs mt-2">{(validation.report?.totalRecords || 0).toLocaleString()} records · {(validation.report?.fileSizeMb || 0).toFixed(2)} MB</div></div>
              {validation.report?.warnings?.length > 0 && <div className="bg-yellow-50 border border-yellow-200 rounded p-2">{validation.report.warnings.map((w: string, i: number) => <p key={i} className="text-xs text-yellow-800">{w}</p>)}</div>}
              <div className="bg-red-50 border border-red-200 rounded p-2"><p className="text-xs text-red-700 font-medium">⚠ This will overwrite ALL current data. Cannot be undone.</p></div>
              <div className="flex gap-2"><Button size="sm" variant="destructive" onClick={handleRequestRestore} disabled={!validation.valid}>Proceed to Confirm</Button><Button size="sm" variant="outline" onClick={() => { setRestoreStep('none'); setRestoreTarget(null); }}>Cancel</Button></div>
            </div> : null)}
            {restoreStep === 'confirm' && <div className="space-y-3"><p className="text-sm font-medium">Type <code className="bg-muted px-1 rounded">RESTORE</code> to confirm:</p><Input placeholder="Type RESTORE" value={confirmText} onChange={e => setConfirmText(e.target.value)} className={confirmText === 'RESTORE' ? 'border-green-400' : ''} /><Button className="w-full" variant="destructive" disabled={confirmText !== 'RESTORE' || restoring} onClick={handleConfirmRestore}>{restoring ? <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />Restoring...</> : <><RotateCcw className="h-4 w-4 mr-1.5" />Execute Restore</>}</Button><Button className="w-full" variant="outline" onClick={() => { setRestoreStep('none'); setConfirmText(''); }}>Cancel</Button></div>}
            {restoreStep === 'done' && <div className="text-center py-4 space-y-2"><CheckCircle className="h-10 w-10 text-green-500 mx-auto" /><p className="font-semibold">Restore Completed</p><p className="text-sm text-muted-foreground">All data restored.</p><Button size="sm" onClick={() => { setRestoreStep('none'); setRestoreTarget(null); setConfirmText(''); setValidation(null); }}>Done</Button></div>}
          </CardContent>
        </Card>
      )}
    </div>

    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><HardDrive className="h-4 w-4" />Backup History</CardTitle></CardHeader>
      <CardContent>
        {loading ? <div className="text-center py-8 text-muted-foreground"><RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />Loading...</div>
        : backups.length === 0 ? <div className="text-center py-12 text-muted-foreground"><Database className="h-12 w-12 mx-auto mb-3 opacity-30" /><p className="font-medium">No backups yet</p><p className="text-sm">Create your first backup above.</p></div>
        : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left py-3 px-3 font-medium">Date / Time</th><th className="text-left py-3 px-3 font-medium">Type</th><th className="text-right py-3 px-3 font-medium">Size</th><th className="text-left py-3 px-3 font-medium">Duration</th><th className="text-left py-3 px-3 font-medium">Status</th><th className="text-left py-3 px-3 font-medium">Created By</th><th className="text-left py-3 px-3 font-medium">Restored</th><th className="text-right py-3 px-3 font-medium">Actions</th></tr></thead>
          <tbody>{backups.map(b => <tr key={b.id} className="border-b hover:bg-muted/30">
            <td className="py-3 px-3"><div className="font-medium">{format(new Date(b.createdAt), 'MMM d, yyyy')}</div><div className="text-xs text-muted-foreground">{format(new Date(b.createdAt), 'HH:mm:ss')}</div></td>
            <td className="py-3 px-3"><span className="text-xs bg-muted px-2 py-0.5 rounded">{TYPE_LABELS[b.backupType] || b.backupType}</span></td>
            <td className="py-3 px-3 text-right">{formatBytes(Number(b.fileSize))}</td>
            <td className="py-3 px-3 text-muted-foreground">{b.durationMs ? `${(b.durationMs / 1000).toFixed(1)}s` : '—'}</td>
            <td className="py-3 px-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[b.status] || 'bg-gray-100 text-gray-700'}`}>{b.status}</span>{b.errorMessage && <p className="text-xs text-red-500 mt-0.5 max-w-[150px] truncate" title={b.errorMessage}>{b.errorMessage}</p>}</td>
            <td className="py-3 px-3 text-muted-foreground">{b.creator?.name || '—'}</td>
            <td className="py-3 px-3 text-muted-foreground text-xs">{b.restoredAt ? <span className="text-orange-600">{format(new Date(b.restoredAt), 'MMM d')}</span> : '—'}</td>
            <td className="py-3 px-3"><div className="flex gap-1 justify-end">
              {b.status === 'completed' && <><Button size="sm" variant="ghost" title="Download" onClick={() => downloadFile(`/api/backups/${b.id}/download`, b.filename)}><Download className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" title="Validate & Restore" onClick={() => handleValidate(b)}><RotateCcw className="h-3.5 w-3.5 text-orange-500" /></Button></>}
              <Button size="sm" variant="ghost" title="Delete" onClick={() => handleDelete(b)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
            </div></td>
          </tr>)}</tbody></table></div>}
      </CardContent>
    </Card>

    <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
      <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
      <div><p className="font-semibold mb-1">Backup Security</p><p>All backups are compressed with gzip and verified with SHA-256 checksums. Store downloaded backups in a secure, off-site location.</p></div>
    </div>
  </div>);
}
