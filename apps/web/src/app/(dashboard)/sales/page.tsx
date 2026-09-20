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
import { useAuth, hasPermission } from '@/lib/auth';
import { ColumnDef } from '@tanstack/react-table';
import { ShoppingBag, DollarSign, TrendingUp, XCircle, ShoppingCart, Download } from 'lucide-react';

interface Sale {
  id: string; saleNumber: string; customerName: string;
  total: number; paid: number; status: string; paymentStatus: string;
  saleDate: string; itemsCount: number;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  COMPLETED: 'default', HELD: 'secondary', CANCELLED: 'destructive', DRAFT: 'outline',
};

const columns: ColumnDef<Sale>[] = [
  { accessorKey: 'saleNumber', header: 'Sale #', cell: ({ row }) => (
    <Link href={`/sales/${row.original.id}`} className="font-medium hover:text-primary">{row.original.saleNumber}</Link>
  )},
  { accessorKey: 'customerName', header: 'Customer' },
  { accessorKey: 'saleDate', header: 'Date', cell: ({ row }) => new Date(row.original.saleDate).toLocaleDateString() },
  { accessorKey: 'itemsCount', header: 'Items' },
  { accessorKey: 'total', header: 'Total', cell: ({ row }) => formatPkr(row.original.total) },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={statusVariant[row.original.status] || 'outline'}>{row.original.status}</Badge> },
  { id: 'actions', header: '', cell: ({ row }) => (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" asChild><Link href={`/sales/${row.original.id}`}>View</Link></Button>
      {row.original.status === 'COMPLETED' && <Button variant="ghost" size="sm" asChild><Link href={`/sales/returns/create?saleId=${row.original.id}`}>Return</Link></Button>}
    </div>
  )},
];

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    async function load() {
      const [listRes, statsRes] = await Promise.all([
        apiGet('/sales').catch(() => null),
        apiGet('/sales/stats').catch(() => null),
      ]);
      if (listRes?.data) setSales(listRes.data);
      if (statsRes?.data) setStats(statsRes.data);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Sales" description="Manage sales transactions">
        <Button variant="outline" size="sm" onClick={() => downloadFile('/api/sales/export/csv', 'sales.csv')}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
        <Button size="sm" asChild><Link href="/pos"><ShoppingCart className="h-4 w-4 mr-1.5" />New Sale</Link></Button>
      </PageHeader>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Today's Sales" value={stats ? `${stats.todaySales}` : (loading ? '...' : '0')} icon={ShoppingBag} variant="primary" />
        <StatCard title="Revenue" value={stats ? formatPkr(stats.todayRevenue) : (loading ? '...' : formatPkr(0))} icon={DollarSign} variant="success" />
        <StatCard title="Total Revenue" value={stats ? formatPkr(stats.totalRevenue) : (loading ? '...' : formatPkr(0))} icon={TrendingUp} variant="info" />
        <StatCard title="Cancelled" value={stats?.cancelledSales ?? (loading ? '...' : '0')} icon={XCircle} variant="danger" />
      </div>
      <DataTable columns={columns} data={sales} loading={loading} searchKey="saleNumber" searchPlaceholder="Search sale # or customer..." pageSize={25} />
    </div>
  );
}
