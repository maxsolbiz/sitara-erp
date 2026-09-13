'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/data-table'; import { apiGet, downloadFile } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { Download, Users, Clock, AlertTriangle } from 'lucide-react'; import { ColumnDef } from '@tanstack/react-table';

export default function CustomerAgingPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/reports/customer-aging').then((r: any) => { if (r?.data) setData(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  const cols: ColumnDef<any>[] = [
    { accessorKey: 'customerName', header: 'Customer' }, { accessorKey: 'phone', header: 'Phone' },
    { accessorKey: 'current', header: 'Current', cell: ({ row }) => formatPkr(row.original.current) },
    { accessorKey: 'days_1_30', header: '1-30 Days', cell: ({ row }) => <span className="text-amber-600">{formatPkr(row.original.days_1_30)}</span> },
    { accessorKey: 'days_31_60', header: '31-60 Days', cell: ({ row }) => <span className="text-orange-600">{formatPkr(row.original.days_31_60)}</span> },
    { accessorKey: 'days_61_90', header: '61-90 Days', cell: ({ row }) => <span className="text-red-500">{formatPkr(row.original.days_61_90)}</span> },
    { accessorKey: 'days_over_90', header: '>90 Days', cell: ({ row }) => <span className="text-red-700 font-bold">{formatPkr(row.original.days_over_90)}</span> },
    { accessorKey: 'oldestInvoiceDate', header: 'Oldest Invoice' },
  ];
  const s = data?.summary;
  return (<div className="space-y-6">
    <PageHeader title="Customer Aging" description="Outstanding credit balances by age">
      <Button variant="outline" size="sm" onClick={() => downloadFile('/api/v1/reports/customers/export', 'customer-aging.csv')}><Download className="h-4 w-4 mr-1.5" />CSV</Button>
    </PageHeader>
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{formatPkr(s?.totalOutstanding || 0)}</p></CardContent></Card>
      <Card className="border-emerald-300"><CardHeader className="pb-1"><CardTitle className="text-xs text-emerald-700">Current</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-emerald-700">{formatPkr(s?.current || 0)}</p></CardContent></Card>
      <Card className="border-amber-300"><CardHeader className="pb-1"><CardTitle className="text-xs text-amber-700">1-30 Days</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-amber-700">{formatPkr(s?.days_1_30 || 0)}</p></CardContent></Card>
      <Card className="border-orange-300"><CardHeader className="pb-1"><CardTitle className="text-xs text-orange-700">31-60 Days</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-orange-700">{formatPkr(s?.days_31_60 || 0)}</p></CardContent></Card>
      <Card className="border-red-300"><CardHeader className="pb-1"><CardTitle className="text-xs text-red-700">61-90 Days</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-red-700">{formatPkr(s?.days_61_90 || 0)}</p></CardContent></Card>
      <Card className="border-red-600"><CardHeader className="pb-1"><CardTitle className="text-xs text-red-800">90+ Days</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-red-800">{formatPkr(s?.days_over_90 || 0)}</p></CardContent></Card>
    </div>
    <DataTable columns={cols} data={data?.items || []} loading={loading} searchKey="customerName" />
  </div>);
}
