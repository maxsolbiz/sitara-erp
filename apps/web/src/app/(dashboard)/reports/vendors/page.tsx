'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/data-table'; import { apiGet, downloadFile } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { Download, Truck, DollarSign, TrendingUp, CreditCard } from 'lucide-react'; import { ColumnDef } from '@tanstack/react-table';

export default function VendorsReportPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState('this_month');
  useEffect(() => { setLoading(true); apiGet(`/reports/vendors?preset=${preset}`).then((r: any) => { if (r?.data) setData(r.data); setLoading(false); }).catch(() => setLoading(false)); }, [preset]);
  const cols: ColumnDef<any>[] = [
    { accessorKey: 'vendorName', header: 'Vendor' }, { accessorKey: 'contactPerson', header: 'Contact' },
    { accessorKey: 'totalOrders', header: 'Orders' }, { accessorKey: 'totalPurchaseValue', header: 'Purchases', cell: ({ row }) => formatPkr(row.original.totalPurchaseValue) },
    { accessorKey: 'totalPayments', header: 'Payments', cell: ({ row }) => formatPkr(row.original.totalPayments) },
    { accessorKey: 'balance', header: 'Balance', cell: ({ row }) => <span className={row.original.balance > 0 ? 'text-red-600' : 'text-emerald-600'}>{formatPkr(row.original.balance)}</span> },
  ];
  const s = data?.summary;
  return (<div className="space-y-6">
    <PageHeader title="Vendors Report" description="Vendor performance and payables"><Button variant="outline" size="sm" onClick={() => downloadFile(`/api/v1/reports/vendors/export?preset=${preset}`, 'vendors-report.csv')}><Download className="h-4 w-4 mr-1.5" />CSV</Button></PageHeader>
    <div className="flex gap-2 flex-wrap">{['this_month', 'last_month', 'this_quarter', 'this_year'].map((p) => (<Button key={p} variant={preset === p ? 'default' : 'outline'} size="sm" onClick={() => setPreset(p)}>{p.replace('_', ' ')}</Button>))}</div>
    <div className="grid gap-3 sm:grid-cols-4">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><Truck className="h-3 w-3 inline mr-1" />Vendors</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{s?.totalVendors || 0}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><TrendingUp className="h-3 w-3 inline mr-1" />Purchases</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.totalPurchaseValue || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><CreditCard className="h-3 w-3 inline mr-1" />Payments</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.totalPayments || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><DollarSign className="h-3 w-3 inline mr-1" />Payable</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-red-600">{formatPkr(s?.outstandingPayables || 0)}</p></CardContent></Card>
    </div>
    <DataTable columns={cols} data={data?.items || []} loading={loading} searchKey="vendorName" />
  </div>);
}
