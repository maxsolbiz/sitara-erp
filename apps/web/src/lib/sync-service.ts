import { getPendingSales, markSaleSynced, markSaleFailed, getAllPendingCount } from './offline-db';

let isSyncing = false;

export async function syncPendingSales(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 };
  isSyncing = true;
  let synced = 0, failed = 0;
  try {
    const pending = await getPendingSales();
    if (pending.length === 0) return { synced: 0, failed: 0 };
    for (const sale of pending) {
      try {
        const res = await fetch('/api/pos/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
          body: JSON.stringify({ ...sale.payload, offlineId: sale.id, offlineCreatedAt: sale.createdAt }),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          await markSaleSynced(sale.id);
          synced++;
        } else {
          const err = await res.json().catch(() => ({ error: 'Server error' }));
          await markSaleFailed(sale.id, err.error || `HTTP ${res.status}`);
          failed++;
        }
      } catch (err: any) {
        await markSaleFailed(sale.id, err.message || 'Network error');
        failed++;
      }
    }
  } finally { isSyncing = false; }
  return { synced, failed };
}

export function startSyncListener(onSyncComplete?: (result: { synced: number; failed: number }) => void) {
  const handleOnline = async () => {
    const count = await getAllPendingCount();
    if (count > 0) {
      const result = await syncPendingSales();
      onSyncComplete?.(result);
    }
  };
  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', async () => {
    if (navigator.onLine) {
      const count = await getAllPendingCount();
      if (count > 0) {
        const result = await syncPendingSales();
        onSyncComplete?.(result);
      }
    }
  });
  if (navigator.onLine) {
    getAllPendingCount().then(count => { if (count > 0) syncPendingSales().then(result => onSyncComplete?.(result)); });
  }
  return () => { window.removeEventListener('online', handleOnline); };
}
