'use client';
import { useState, useEffect } from 'react';
import { getAllPendingCount } from '@/lib/offline-db';
import { syncPendingSales } from '@/lib/sync-service';

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const updatePendingCount = async () => setPendingCount(await getAllPendingCount());
    updatePendingCount();
    const handleOnline = async () => {
      setIsOnline(true);
      const count = await getAllPendingCount();
      if (count > 0) {
        setIsSyncing(true);
        await syncPendingSales();
        setIsSyncing(false);
        setLastSync(new Date());
        await updatePendingCount();
      }
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const interval = setInterval(updatePendingCount, 5000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);
  return { isOnline, pendingCount, isSyncing, lastSync };
}
