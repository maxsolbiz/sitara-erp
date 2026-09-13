'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/data-table'; import { apiGet, downloadFile } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { Download, Users, DollarSign, TrendingUp } from 'lucide-react'; import { ColumnDef } from '@tanstack/react-table';

export default function CustomersReportPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState('this_month');
  useEffect(() => { setLoading(true); apiGet(`/reports/customers?preset=${preset}`).then((r: any) => { if (r?.data) setData(r.data); setLoading(false); }).catch(() => setLoading(false)); }, [preset]);
  const cols: ColumnDef<any>[] = [
    { accessorKey: 'customerName', header: 'Customer' }, { accessorKey: 'phone', header: 'Phone' },
    { accessorKey: 'totalSales', header: 'Sales' }, { accessorKey: 'totalRevenue', header: 'Revenue', cell: ({ row }) => formatPkr(row.original.totalRevenue) },
    { accessorKey: 'profit', header: 'Profit', cell: ({ row }) => <span className={row.original.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatPkr(row.original.profit)}</span> },
    { accessorKey: 'currentBalance', header: 'Balance', cell: ({ row }) => <span className={row.original.currentBalance > 0 ? 'text-red-600' : ''}>{formatPkr(row.original.currentBalance)}</span> },
  ];
  const s = data?.summary;
  return (<div className="space-y-6">
    <PageHeader title="Customers Report" description="Customer sales and profitability"><Button variant="outline" size="sm" onClick={() => downloadFile(`/api/v1/reports/customers/export?preset=${preset}`, 'customer-report.csv')}><Download className="h-4 w-4 mr-1.5" />CSV</Button></PageHeader>
    <div className="flex gap-2 flex-wrap">{['this_month', 'last_month', 'this_quarter', 'this_year'].map((p) => (<Button key={p} variant={preset === p ? 'default' : 'outline'} size="sm" onClick={() => setPreset(p)}>{p.replace('_', ' ')}</Button>))}</div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><Users className="h-3 w-3 inline mr-1" />Customers</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{s?.totalCustomers || 0}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><DollarSign className="h-3 w-3 inline mr-1" />Total Revenue</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.totalRevenue || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><TrendingUp className="h-3 w-3 inline mr-1" />Total Profit</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-emerald-600">{formatPkr(s?.totalProfit || 0)}</p></CardContent></Card>
    </div>
    <DataTable columns={cols} data={data?.items || []} loading={loading} searchKey="customerName" />
  </div>);
}
