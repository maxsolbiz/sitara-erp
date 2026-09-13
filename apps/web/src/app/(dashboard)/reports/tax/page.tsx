'use client'; import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; import { Input } from '@/components/ui/input';
import { apiGet } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { Download, Printer, TrendingUp, DollarSign, FileText, Percent } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';

interface TaxRateRow { rate: number; sales: number; taxAmount: number; count: number; pct: string; }

export default function TaxReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const fyYear = today.getMonth() < 6 ? today.getFullYear() - 1 : today.getFullYear();
  const [startDate, setStartDate] = useState(`${fyYear}-07-01`);
  const [endDate, setEndDate] = useState(`${fyYear + 1}-06-30`);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    const r = await apiGet(`/reports/tax?from=${from}&to=${to}`).catch(() => null);
    if (r?.data) setData(r.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(startDate, endDate); }, [startDate, endDate, load]);

  const cols: ColumnDef<TaxRateRow>[] = [
    { accessorKey: 'rate', header: 'Rate %', cell: ({ row }) => `${row.original.rate}%` },
    { accessorKey: 'count', header: 'No. of Transactions' },
    { accessorKey: 'sales', header: 'Sales Amount', cell: ({ row }) => formatPkr(row.original.sales) },
    { accessorKey: 'taxAmount', header: 'Tax Amount', cell: ({ row }) => formatPkr(row.original.taxAmount) },
    { accessorKey: 'pct', header: '% of Total', cell: ({ row }) => row.original.pct },
  ];

  const s = data?.summary;
  const taxRateData: TaxRateRow[] = (data?.byTaxRate || []).map((r: any) => ({
    ...r, pct: s?.totalSales > 0 ? `${((r.sales / s.totalSales) * 100).toFixed(1)}%` : '0%',
  }));

  const exportCsv = () => {
    if (!data) return;
    const rows = [['Rate %', 'No. of Transactions', 'Sales Amount', 'Tax Amount', '% of Total'].join(',')];
    for (const r of taxRateData) rows.push([`${r.rate}%`, r.count, r.sales, r.taxAmount, r.pct].join(','));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `tax-report-${startDate}-${endDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (<div className="space-y-6">
    <PageHeader title="Tax Summary Report" description="GST/VAT collected by tax rate and period">
      <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />CSV</Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
    </PageHeader>
    <div className="flex gap-3 items-end flex-wrap">
      <div><label className="text-xs text-muted-foreground block mb-1">From</label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" /></div>
      <div><label className="text-xs text-muted-foreground block mb-1">To</label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" /></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Total Sales</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.totalSales || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Taxable Sales</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.taxableSales || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Exempt Sales</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.exemptSales || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Percent className="h-3 w-3" /> Total GST Collected</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-emerald-600">{formatPkr(s?.totalTaxCollected || 0)}</p><p className="text-xs text-muted-foreground">Avg rate: {s?.averageTaxRate || 0}%</p></CardContent></Card>
    </div>
    {data?.byTaxRate && data.byTaxRate.length > 0 && (
      <Card><CardHeader><CardTitle className="text-sm">Tax Rate Breakdown</CardTitle></CardHeader><CardContent><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.byTaxRate} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}><XAxis dataKey="rate" tickFormatter={(v) => `${v}%`} /><YAxis tickFormatter={(v) => `Rs.${(v / 1000).toFixed(0)}k`} /><Tooltip formatter={(value: number) => [formatPkr(value), 'Sales']} labelFormatter={(label) => `Rate: ${label}%`} /><Bar dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
    )}
    <DataTable columns={cols} data={taxRateData} loading={loading} searchKey="rate" searchPlaceholder="Search rate..." pageSize={20} />
  </div>);
}
