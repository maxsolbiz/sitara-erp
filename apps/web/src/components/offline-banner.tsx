'use client';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

export function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing } = useOfflineStatus();
  if (isOnline && pendingCount === 0 && !isSyncing) return null;
  return (
    <div className={`fixed top-0 left-0 right-0 z-[9999] py-2 px-4 flex items-center justify-between text-sm font-medium transition-all duration-300 ${!isOnline ? 'bg-red-600 text-white' : isSyncing ? 'bg-yellow-500 text-white' : 'bg-green-600 text-white'}`}>
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <><WifiOff className="h-4 w-4" /><span>You are offline — Sales saved locally{pendingCount > 0 && ` (${pendingCount} pending)`}</span></>
        ) : isSyncing ? (
          <><RefreshCw className="h-4 w-4 animate-spin" /><span>Syncing {pendingCount} offline sale{pendingCount !== 1 ? 's' : ''}...</span></>
        ) : (
          <><Wifi className="h-4 w-4" /><span>{pendingCount} sale{pendingCount !== 1 ? 's' : ''} pending sync</span></>
        )}
      </div>
    </div>
  );
}
