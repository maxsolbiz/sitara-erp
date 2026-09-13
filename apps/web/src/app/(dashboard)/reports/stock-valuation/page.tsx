'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/data-table'; import { apiGet } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { DollarSign, TrendingUp } from 'lucide-react'; import { ColumnDef } from '@tanstack/react-table';

export default function StockValuationPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/reports/stock-valuation').then((r: any) => { if (r?.data) setData(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  const s = data;
  const cols: ColumnDef<any>[] = [
    { accessorKey: 'batchNumber', header: 'Batch' }, { accessorKey: 'productName', header: 'Product' },
    { accessorKey: 'warehouseName', header: 'Warehouse' }, { accessorKey: 'quantityRemaining', header: 'Qty' },
    { accessorKey: 'unitCost', header: 'Unit Cost', cell: ({ row }) => formatPkr(row.original.unitCost) },
    { accessorKey: 'totalCost', header: 'Total Cost', cell: ({ row }) => formatPkr(row.original.totalCost) },
    { accessorKey: 'totalRetail', header: 'Retail Value', cell: ({ row }) => formatPkr(row.original.totalRetail) },
  ];
  return (<div className="space-y-6">
    <PageHeader title="Stock Valuation" description="FIFO batch valuation" />
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><DollarSign className="h-3 w-3 inline mr-1" />Total Cost</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.totalCost || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><TrendingUp className="h-3 w-3 inline mr-1" />Retail Value</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.totalRetail || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Potential Profit</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-emerald-600">{formatPkr(s?.potentialProfit || 0)}</p></CardContent></Card>
    </div>
    {s?.byCategory?.map((cat: any) => (<Card key={cat.category}><CardHeader><CardTitle className="text-sm">{cat.category}</CardTitle></CardHeader><CardContent><div className="flex gap-4 text-sm"><span>Qty: {cat.qty}</span><span>Cost: {formatPkr(cat.cost)}</span><span>Retail: {formatPkr(cat.retail)}</span></div></CardContent></Card>))}
    <DataTable columns={cols} data={s?.batches || []} loading={loading} searchKey="productName" />
  </div>);
}
