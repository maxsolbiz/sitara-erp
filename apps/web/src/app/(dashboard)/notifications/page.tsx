'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button'; import { Badge } from '@/components/ui/badge';
import { apiGet, apiPatch, apiDelete } from '@/lib/api'; import { toast } from 'sonner';
import { Bell, Info, AlertTriangle, CheckCircle, XCircle, Check, Trash2 } from 'lucide-react';

const icons: Record<string, any> = { info: Info, warning: AlertTriangle, success: CheckCircle, error: XCircle };

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  const load = async () => { setLoading(true); const r = await apiGet('/notifications').catch(() => null); if (r?.data) setItems(r.data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const filtered = filter === 'ALL' ? items : filter === 'UNREAD' ? items.filter((n) => !n.isRead) : items.filter((n) => n.isRead);

  const markRead = async (id: string) => { await apiPatch(`/notifications/${id}/read`, {}); load(); };
  const markAllRead = async () => { await apiPatch('/notifications/read-all', {}); load(); toast.success('All marked as read'); };
  const del = async (id: string) => { await apiDelete(`/notifications/${id}`); load(); };

  const unread = items.filter((n) => !n.isRead).length;

  return (<div className="space-y-6">
    <PageHeader title="Notifications" description={`${unread} unread`}>
      {unread > 0 && <Button variant="outline" size="sm" onClick={markAllRead}><Check className="h-4 w-4 mr-1.5" />Mark All Read</Button>}
    </PageHeader>
    <div className="flex gap-2 flex-wrap">
      <Button variant={filter === 'ALL' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('ALL')}>All ({items.length})</Button>
      <Button variant={filter === 'UNREAD' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('UNREAD')}>Unread ({unread})</Button>
      <Button variant={filter === 'READ' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('READ')}>Read ({items.length - unread})</Button>
    </div>
    {loading ? <div className="text-center py-12 text-muted-foreground">Loading...</div> : filtered.length === 0 ? (
      <div className="text-center py-12"><Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" /><p className="text-muted-foreground">No notifications</p></div>
    ) : <div className="rounded-lg border">{filtered.map((n: any) => {
      const Icon = icons[n.type] || Info;
      return (<div key={n.id} className={`flex items-start gap-3 p-4 border-b last:border-0 ${!n.isRead ? 'bg-muted/20' : ''}`}>
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${n.type === 'warning' ? 'text-amber-500' : n.type === 'success' ? 'text-emerald-500' : n.type === 'error' ? 'text-red-500' : 'text-blue-500'}`} />
        <div className="flex-1 min-w-0"><p className="text-sm font-medium">{n.title}</p><p className="text-xs text-muted-foreground mt-0.5">{n.message}</p><p className="text-[10px] text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p></div>
        <div className="flex gap-1 shrink-0">{!n.isRead && <Button variant="ghost" size="sm" onClick={() => markRead(n.id)}><Check className="h-3.5 w-3.5" /></Button>}<Button variant="ghost" size="sm" onClick={() => del(n.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button></div>
        {!n.isRead && <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-2" />}
      </div>);
    })}</div>}
  </div>);
}
