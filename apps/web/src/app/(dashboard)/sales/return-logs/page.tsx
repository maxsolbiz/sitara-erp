'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api';
import { useAuth, hasPermission } from '@/lib/auth';
import { ColumnDef } from '@tanstack/react-table';
import { ClipboardList, CheckCircle, XCircle } from 'lucide-react';

interface RLog { id: string; saleId: string; returnNumber: string; status?: string; errorMessage: string | null; createdAt: string; }
interface RStats { total?: number; success?: number; failed?: number; }
const columns: ColumnDef<RLog>[] = [
  { accessorKey: 'returnNumber', header: 'Return #' },
  { accessorKey: 'saleId', header: 'Sale', cell: ({ row }) => <Link href={`/sales/${row.original.saleId}`} className="text-primary hover:underline">#{row.original.saleId}</Link> },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={row.original.status === 'SUCCESS' ? 'default' : 'destructive'}>{row.original.status || 'FAILED'}</Badge> },
  { accessorKey: 'errorMessage', header: 'Error', cell: ({ row }) => <span className="truncate max-w-[320px] block" title={row.original.errorMessage || ''}>{row.original.errorMessage || '-'}</span> },
  { accessorKey: 'createdAt', header: 'Date', cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
];

export default function ReturnLogsPage() {
  const { user } = useAuth();
  const can = hasPermission(user, 'sales.returns.view');
  const [tab, setTab] = useState<'ALL' | 'FAILED'>('ALL');
  const [logs, setLogs] = useState<RLog[]>([]);
  const [stats, setStats] = useState<RStats>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!can) return;
    apiGet('/sales/return-logs/stats').then((r: any) => { if (r?.data) setStats(r.data); }).catch(() => {});
  }, [can]);
  useEffect(() => {
    if (!can) return;
    let alive = true; setLoading(true); setErr('');
    apiGet(tab === 'FAILED' ? '/sales/return-logs/failed' : '/sales/return-logs').catch(() => null).then((r: any) => {
      if (!alive) return;
      if (r?.data) setLogs(r.data); else { setLogs([]); setErr(r?.error?.detail || 'Could not load return logs'); }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [tab, can]);
  if (!can) return <div className="text-center py-12 text-muted-foreground">You do not have access to return logs.</div>;
  return (<div className="space-y-6">
    <PageHeader title="Return Processing Logs" description="Log of POS return processing (latest 50)"><Button variant="outline" size="sm" asChild><Link href="/sales/returns">Sales Returns</Link></Button></PageHeader>
    <div data-testid="rl-stats" className="grid gap-3 sm:grid-cols-3">
      <StatCard title="Total Logs" value={stats.total ?? 0} icon={ClipboardList} variant="primary" />
      <StatCard title="Successful" value={stats.success ?? 0} icon={CheckCircle} variant="success" />
      <StatCard title="Failed Returns" value={stats.failed ?? 0} icon={XCircle} variant="danger" />
    </div>
    <div className="flex gap-2"><Button size="sm" variant={tab === 'ALL' ? 'default' : 'outline'} onClick={() => setTab('ALL')}>All</Button><Button size="sm" variant={tab === 'FAILED' ? 'default' : 'outline'} onClick={() => setTab('FAILED')}>Failed</Button></div>
    {err ? <p className="text-red-600 text-sm">{err}</p> : !loading && logs.length === 0 ? <p className="text-sm text-muted-foreground">{tab === 'FAILED' ? 'No failed returns' : 'No return logs yet'}</p> : <DataTable columns={columns} data={logs} loading={loading} searchKey="returnNumber" />}
  </div>);
}
