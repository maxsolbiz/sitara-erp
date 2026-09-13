'use client'; import { useState, useEffect, useRef } from 'react';
import Link from 'next/link'; import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button'; import { Badge } from '@/components/ui/badge';
import { apiGet, apiPatch } from '@/lib/api'; import { Bell, Check, Info, AlertTriangle, CheckCircle, XCircle, ExternalLink } from 'lucide-react';

const typeIcons: Record<string, any> = { info: Info, warning: AlertTriangle, success: CheckCircle, error: XCircle };
const typeColors: Record<string, string> = { info: 'text-blue-500', warning: 'text-amber-500', success: 'text-emerald-500', error: 'text-red-500' };

function timeAgo(d: string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const [count, setCount] = useState(0); const [notifs, setNotifs] = useState<any[]>([]);
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchCount = async () => { const r = await apiGet('/notifications/unread-count').catch(() => null); if (r?.data?.count !== undefined) setCount(r.data.count); };
  const fetchNotifs = async () => { const r = await apiGet('/notifications').catch(() => null); if (r?.data) setNotifs(r.data.slice(0, 10)); };

  useEffect(() => { fetchCount(); const i = setInterval(fetchCount, 60000); return () => clearInterval(i); }, []);
  useEffect(() => { if (open) fetchNotifs(); }, [open]);
  useEffect(() => { const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', handle); return () => document.removeEventListener('mousedown', handle); }, []);

  const markRead = async (id: string) => { await apiPatch(`/notifications/${id}/read`, {}); fetchCount(); fetchNotifs(); };

  return (<div ref={ref} className="relative">
    <Button variant="ghost" size="icon" className="h-9 w-9 relative" onClick={() => setOpen(!open)}>
      <Bell className="h-4 w-4" />
      {count > 0 && <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] p-0 flex items-center justify-center text-[10px] bg-red-500">{count > 99 ? '99+' : count}</Badge>}
    </Button>
    {open && <div className="absolute right-0 top-full mt-1 w-80 bg-card border rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between p-3 border-b sticky top-0 bg-card">
        <span className="font-semibold text-sm">Notifications</span>
        {count > 0 && <Button variant="ghost" size="sm" className="text-xs h-7" onClick={async () => { await apiPatch('/notifications/read-all', {}); setCount(0); fetchNotifs(); }}><Check className="h-3 w-3 mr-1" />Mark all read</Button>}
      </div>
      {notifs.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No notifications</div> : notifs.map((n: any) => {
        const Icon = typeIcons[n.type] || Info; const color = typeColors[n.type] || 'text-blue-500';
        return (<div key={n.id} className={`flex gap-3 p-3 border-b hover:bg-muted/50 cursor-pointer ${!n.isRead ? 'bg-muted/20' : ''}`} onClick={() => { if (!n.isRead) markRead(n.id); if (n.data?.link) router.push(n.data.link); }}>
          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
          <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{n.title}</p><p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p><p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p></div>
          {!n.isRead && <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
        </div>);
      })}
      <Link href="/notifications" className="block text-center text-sm text-primary py-2 hover:bg-muted/30 border-t" onClick={() => setOpen(false)}>View all notifications</Link>
    </div>}
  </div>);
}
