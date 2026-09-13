'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/data-table'; import { apiGet, downloadFile } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { Download, Package, CheckCircle2, Clock, DollarSign } from 'lucide-react'; import { ColumnDef } from '@tanstack/react-table';

export default function PurchasesReportPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState('this_month');
  const presets = [{ key: 'this_month', label: 'This Month' }, { key: 'last_month', label: 'Last Month' }, { key: 'this_quarter', label: 'This Quarter' }, { key: 'this_year', label: 'This Year' }];
  const load = async (p: string) => { setLoading(true); const r = await apiGet(`/reports/purchases?preset=${p}`).catch(() => null); if (r?.data) setData(r.data); setLoading(false); };
  useEffect(() => { load(preset); }, [preset]);
  const cols: ColumnDef<any>[] = [
    { accessorKey: 'orderNumber', header: 'PO #' }, { accessorKey: 'orderDate', header: 'Date', cell: ({ row }) => new Date(row.original.orderDate).toLocaleDateString() },
    { accessorKey: 'vendorName', header: 'Vendor' }, { accessorKey: 'itemCount', header: 'Items' },
    { accessorKey: 'totalAmount', header: 'Total', cell: ({ row }) => formatPkr(row.original.totalAmount) },
    { accessorKey: 'status', header: 'Status' },
  ];
  const s = data?.summary;
  return (<div className="space-y-6">
    <PageHeader title="Purchase Report"><Button variant="outline" size="sm" onClick={() => downloadFile(`/api/v1/reports/purchases/export?preset=${preset}`, 'purchase-report.csv')}><Download className="h-4 w-4 mr-1.5" />CSV</Button></PageHeader>
    <div className="flex gap-2 flex-wrap">{presets.map((p) => (<Button key={p.key} variant={preset === p.key ? 'default' : 'outline'} size="sm" onClick={() => setPreset(p.key)}>{p.label}</Button>))}</div>
    <div className="grid gap-3 sm:grid-cols-4">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><Package className="h-3 w-3 inline mr-1" />Orders</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{s?.totalOrders || 0}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><CheckCircle2 className="h-3 w-3 inline mr-1" />Received</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{s?.totalReceived || 0}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><DollarSign className="h-3 w-3 inline mr-1" />Total Value</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.totalOrderValue || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" />Pending</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-amber-600">{s?.pendingOrders || 0}</p></CardContent></Card>
    </div>
    <DataTable columns={cols} data={data?.items || []} loading={loading} searchKey="orderNumber" />
  </div>);
}
