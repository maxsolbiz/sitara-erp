'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { ColumnDef } from '@tanstack/react-table';
import { Package, AlertTriangle, Warehouse, ArrowUpDown } from 'lucide-react';

interface StockItem { id: string; productName: string; sku: string; quantity: number; warehouse: string; reorderLevel: number; price: number; }
const columns: ColumnDef<StockItem>[] = [
  { accessorKey: 'productName', header: 'Product', cell: ({ row }) => (<div><span className="font-medium">{row.original.productName}</span><p className="text-xs text-muted-foreground">{row.original.sku}</p></div>) },
  { accessorKey: 'warehouse', header: 'Warehouse' },
  { accessorKey: 'quantity', header: 'Stock', cell: ({ row }) => { const q = row.original.quantity; const rl = row.original.reorderLevel; return <span className={q === 0 ? 'text-red-600 font-bold' : q <= rl ? 'text-amber-600 font-medium' : 'text-emerald-600'}>{q}</span>; } },
  { accessorKey: 'reorderLevel', header: 'Min Level' },
];

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([]); const [stats, setStats] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { async function load() { const [r, s] = await Promise.all([apiGet('/inventory/stock').catch(() => null), apiGet('/inventory/stats').catch(() => null)]); if (r?.data) setItems(r.data); if (s?.data) setStats(s.data); setLoading(false); } load(); }, []);
  return (<div className="space-y-6">
    <PageHeader title="Stock" description="Current inventory levels" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Products Tracked" value={stats?.products ?? (loading ? '...' : '0')} icon={Package} variant="primary" />
      <StatCard title="Total Stock" value={stats?.totalStock ?? (loading ? '...' : '0')} icon={Warehouse} variant="success" />
      <StatCard title="Movements" value={stats?.movements ?? (loading ? '...' : '0')} icon={ArrowUpDown} variant="info" />
      <StatCard title="Low Stock Alerts" value={stats?.lowStock ?? (loading ? '...' : '0')} icon={AlertTriangle} variant="danger" />
    </div>
    <DataTable columns={columns} data={items} loading={loading} searchKey="productName" searchPlaceholder="Search product..." />
  </div>);
}
