'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/data-table'; import { apiGet, downloadFile } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { Download, Package, AlertTriangle, XCircle, DollarSign } from 'lucide-react'; import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';

export default function InventoryReportPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [below, setBelow] = useState(false);
  const load = async (b: boolean) => { setLoading(true); const r = await apiGet(`/reports/inventory?belowReorder=${b}`).catch(() => null); if (r?.data) setData(r.data); setLoading(false); };
  useEffect(() => { load(below); }, [below]);
  const cols: ColumnDef<any>[] = [
    { accessorKey: 'sku', header: 'SKU' }, { accessorKey: 'name', header: 'Product' }, { accessorKey: 'category', header: 'Category' },
    { accessorKey: 'totalStock', header: 'Stock', cell: ({ row }) => <span className={row.original.totalStock === 0 ? 'text-red-600 font-bold' : row.original.totalStock <= row.original.reorderLevel ? 'text-amber-600 font-medium' : ''}>{row.original.totalStock}</span> },
    { accessorKey: 'stockValue', header: 'Value', cell: ({ row }) => formatPkr(row.original.stockValue) },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => row.original.status === 'OUT_OF_STOCK' ? <span className="text-red-600 text-xs font-medium">OUT</span> : row.original.status === 'LOW' ? <span className="text-amber-600 text-xs font-medium">LOW</span> : <span className="text-emerald-600 text-xs font-medium">OK</span> },
  ];
  const s = data?.summary;
  return (<div className="space-y-6">
    <PageHeader title="Inventory Report" description="Stock levels and valuation">
      <Button variant="outline" size="sm"><Link href="/reports/stock-valuation">Valuation</Link></Button>
      <Button variant="outline" size="sm" onClick={() => downloadFile('/api/v1/reports/inventory/export', 'inventory-report.csv')}><Download className="h-4 w-4 mr-1.5" />CSV</Button>
    </PageHeader>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={below} onChange={(e) => setBelow(e.target.checked)} className="h-4 w-4" /> Show only items below reorder level</label>
    <div className="grid gap-3 sm:grid-cols-4">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><Package className="h-3 w-3 inline mr-1" />Products</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{s?.totalProducts || 0}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><DollarSign className="h-3 w-3 inline mr-1" />Stock Value</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.totalStockValue || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><AlertTriangle className="h-3 w-3 inline mr-1" />Below Reorder</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-amber-600">{s?.belowReorderCount || 0}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><XCircle className="h-3 w-3 inline mr-1" />Out of Stock</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-red-600">{s?.outOfStockCount || 0}</p></CardContent></Card>
    </div>
    <DataTable columns={cols} data={data?.items || []} loading={loading} searchKey="name" />
  </div>);
}
