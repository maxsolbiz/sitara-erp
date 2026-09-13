'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiGet, downloadFile } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { ColumnDef } from '@tanstack/react-table';
import { Truck, Plus, ClipboardList, CheckCircle2, XCircle, Clock, Download } from 'lucide-react';

interface PO { id: string; orderNumber: string; vendorName: string; status: string; totalAmount: number; itemCount: number; orderDate: string; }
const statusVar: Record<string, 'default'|'secondary'|'destructive'|'outline'> = { DRAFT: 'outline', SENT: 'secondary', PARTIAL: 'default', RECEIVED: 'default', CANCELLED: 'destructive' };
const columns: ColumnDef<PO>[] = [
  { accessorKey: 'orderNumber', header: 'PO #', cell: ({ row }) => <Link href={`/purchases/orders/${row.original.id}`} className="font-medium hover:text-primary">{row.original.orderNumber}</Link> },
  { accessorKey: 'vendorName', header: 'Vendor' },
  { accessorKey: 'orderDate', header: 'Date', cell: ({ row }) => new Date(row.original.orderDate).toLocaleDateString() },
  { accessorKey: 'totalAmount', header: 'Total', cell: ({ row }) => formatPkr(row.original.totalAmount) },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={statusVar[row.original.status] || 'outline'}>{row.original.status}</Badge> },
  { id: 'actions', header: '', cell: () => <Button variant="ghost" size="sm">View</Button> },
];

export default function PurchasesPage() {
  const [orders, setOrders] = useState<PO[]>([]); const [stats, setStats] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { async function load() { const [r, s] = await Promise.all([apiGet('/purchases/orders').catch(() => null), apiGet('/purchases/orders/stats').catch(() => null)]); if (r?.data) setOrders(r.data); if (s?.data) setStats(s.data); setLoading(false); } load(); }, []);
  return (<div className="space-y-6">
    <PageHeader title="Purchase Orders" description="Manage procurement"><Button variant="outline" size="sm" onClick={() => downloadFile('/api/purchases/orders/export/csv', 'purchase-orders.csv')}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button><Button size="sm" asChild><Link href="/purchases/orders/create"><Plus className="h-4 w-4 mr-1.5" />New PO</Link></Button></PageHeader>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      <StatCard title="Total Orders" value={stats?.total ?? (loading ? '...' : '0')} icon={ClipboardList} variant="primary" />
      <StatCard title="Draft" value={stats?.pending ?? (loading ? '...' : '0')} icon={Clock} variant="warning" />
      <StatCard title="Partial" value={stats?.partial ?? (loading ? '...' : '0')} icon={Truck} variant="info" />
      <StatCard title="Received" value={stats?.received ?? (loading ? '...' : '0')} icon={CheckCircle2} variant="success" />
      <StatCard title="Cancelled" value={stats?.cancelled ?? (loading ? '...' : '0')} icon={XCircle} variant="danger" />
    </div>
    <DataTable columns={columns} data={orders} loading={loading} searchKey="orderNumber" searchPlaceholder="Search PO # or vendor..." />
  </div>);
}
