'use client';
import { useState, useEffect } from 'react';
import { getPendingSales, getFailedSales } from '@/lib/offline-db';
import { syncPendingSales } from '@/lib/sync-service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { format } from 'date-fns';
import { RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { formatPkr } from '@/lib/utils';

export default function OfflineQueuePage() {
  const [pending, setPending] = useState<any[]>([]);
  const [failed, setFailed] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const load = async () => { setPending(await getPendingSales()); setFailed(await getFailedSales()); };
  useEffect(() => { load(); }, []);
  const handleSyncNow = async () => { setSyncing(true); await syncPendingSales(); await load(); setSyncing(false); };
  return (
    <div className="space-y-6">
      <PageHeader title="Offline Queue" description="Sales recorded while offline, waiting to sync">
        {pending.length > 0 && <Button onClick={handleSyncNow} disabled={syncing || !navigator.onLine}><RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Syncing...' : 'Sync Now'}</Button>}
      </PageHeader>
      {pending.length === 0 && failed.length === 0 && (
        <div className="text-center py-12 text-muted-foreground"><CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" /><p className="font-medium">All caught up!</p><p className="text-sm">No pending offline sales.</p></div>
      )}
      {pending.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-yellow-50 px-4 py-2 border-b flex items-center gap-2"><RefreshCw className="h-4 w-4 text-yellow-600" /><span className="font-medium text-yellow-800">{pending.length} Pending Sync</span></div>
          <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="text-left p-3">ID</th><th className="text-left p-3">Created</th><th className="text-left p-3">Items</th><th className="text-right p-3">Total</th><th className="text-left p-3">Attempts</th></tr></thead>
            <tbody>{pending.map(s => (<tr key={s.id} className="border-t"><td className="p-3 font-mono text-xs">{s.id.slice(0, 8)}</td><td className="p-3">{format(new Date(s.createdAt), 'MMM d, HH:mm')}</td><td className="p-3">{s.payload?.items?.length || 0} items</td><td className="p-3 text-right font-semibold">{formatPkr(s.payload?.totalAmount || 0)}</td><td className="p-3">{s.attempts}</td></tr>))}</tbody>
          </table>
        </div>
      )}
      {failed.length > 0 && (
        <div className="border border-red-200 rounded-lg overflow-hidden">
          <div className="bg-red-50 px-4 py-2 border-b flex items-center gap-2"><XCircle className="h-4 w-4 text-red-600" /><span className="font-medium text-red-800">{failed.length} Failed</span></div>
          <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="text-left p-3">ID</th><th className="text-left p-3">Created</th><th className="text-left p-3">Error</th><th className="text-left p-3">Total</th></tr></thead>
            <tbody>{failed.map(s => (<tr key={s.id} className="border-t"><td className="p-3 font-mono text-xs">{s.id.slice(0, 8)}</td><td className="p-3">{format(new Date(s.createdAt), 'MMM d, HH:mm')}</td><td className="p-3 text-red-600 text-xs">{s.lastError}</td><td className="p-3">{formatPkr(s.payload?.totalAmount || 0)}</td></tr>))}</tbody>
          </table>
          <div className="p-4 bg-red-50/50 border-t text-xs text-red-700"><AlertTriangle className="h-3.5 w-3.5 inline mr-1" />Failed sales must be reviewed manually.</div>
        </div>
      )}
    </div>
  );
}
