'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/data-table'; import { apiGet, downloadFile } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { Download, TrendingUp, DollarSign, ShoppingBag, RotateCcw } from 'lucide-react'; import { ColumnDef } from '@tanstack/react-table';

interface SalesItem { saleNumber: string; saleDate: string; customerName: string; itemCount: number; total: number; profit: number; paymentStatus: string; }

export default function SalesReportPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState('this_month');
  const presets = [{ key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' }, { key: 'this_week', label: 'This Week' }, { key: 'this_month', label: 'This Month' }, { key: 'last_month', label: 'Last Month' }, { key: 'this_year', label: 'This Year' }];

  const load = async (p: string) => { setLoading(true); const r = await apiGet(`/reports/sales?preset=${p}`).catch(() => null); if (r?.data) setData(r.data); setLoading(false); };
  useEffect(() => { load(preset); }, [preset]);

  const cols: ColumnDef<any>[] = [
    { accessorKey: 'saleNumber', header: 'Sale #' },
    { accessorKey: 'saleDate', header: 'Date', cell: ({ row }) => new Date(row.original.saleDate).toLocaleDateString() },
    { accessorKey: 'customerName', header: 'Customer' },
    { accessorKey: 'itemCount', header: 'Items' },
    { accessorKey: 'total', header: 'Total', cell: ({ row }) => formatPkr(row.original.total) },
    { accessorKey: 'profit', header: 'Profit', cell: ({ row }) => <span className={row.original.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatPkr(row.original.profit)}</span> },
    { accessorKey: 'paymentStatus', header: 'Status' },
  ];

  const s = data?.summary;
  return (<div className="space-y-6">
    <PageHeader title="Sales Report" description="Revenue, profit, and payment analysis">
      <Button variant="outline" size="sm" onClick={() => downloadFile(`/api/v1/reports/sales/export?preset=${preset}`, 'sales-report.csv')}><Download className="h-4 w-4 mr-1.5" />CSV</Button>
    </PageHeader>
    <div className="flex gap-2 flex-wrap">{presets.map((p) => (<Button key={p.key} variant={preset === p.key ? 'default' : 'outline'} size="sm" onClick={() => setPreset(p.key)}>{p.label}</Button>))}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Total Revenue</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.totalRevenue || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Total Profit</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-emerald-600">{formatPkr(s?.totalProfit || 0)}</p><p className="text-xs text-muted-foreground">Margin: {s?.profitMargin || 0}%</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><ShoppingBag className="h-3 w-3" /> Orders</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{s?.totalSales || 0}</p><p className="text-xs text-muted-foreground">Avg: {formatPkr(s?.averageOrderValue || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><RotateCcw className="h-3 w-3" /> Returns</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-red-600">{s?.totalReturns || 0}</p><p className="text-xs text-muted-foreground">{formatPkr(s?.totalReturnValue || 0)}</p></CardContent></Card>
    </div>
    {s?.paymentBreakdown && <Card><CardHeader><CardTitle className="text-sm">Payment Breakdown</CardTitle></CardHeader><CardContent><div className="flex gap-4 flex-wrap">{Object.entries(s.paymentBreakdown).map(([method, amount]: [string, any]) => (<div key={method} className="bg-muted/50 rounded-lg px-4 py-2 text-center"><p className="text-xs text-muted-foreground">{method}</p><p className="text-lg font-bold">{formatPkr(amount as number)}</p></div>))}</div></CardContent></Card>}
    <DataTable columns={cols} data={data?.items || []} loading={loading} searchKey="saleNumber" />
  </div>);
}
