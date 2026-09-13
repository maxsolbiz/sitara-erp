'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/data-table'; import { apiGet, downloadFile } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { Download, FileText, DollarSign, CheckCircle2, Clock } from 'lucide-react'; import { ColumnDef } from '@tanstack/react-table';

export default function ExpensesReportPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState('this_month');
  useEffect(() => { setLoading(true); apiGet(`/reports/expenses?preset=${preset}`).then((r: any) => { if (r?.data) setData(r.data); setLoading(false); }).catch(() => setLoading(false)); }, [preset]);
  const cols: ColumnDef<any>[] = [
    { accessorKey: 'expenseNumber', header: 'Expense #' }, { accessorKey: 'expenseDate', header: 'Date', cell: ({ row }) => new Date(row.original.expenseDate).toLocaleDateString() },
    { accessorKey: 'categoryName', header: 'Category' }, { accessorKey: 'description', header: 'Description' },
    { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => formatPkr(row.original.amount) },
    { accessorKey: 'status', header: 'Status' },
  ];
  const s = data?.summary;
  return (<div className="space-y-6">
    <PageHeader title="Expense Report" description="Expenses by category and status"><Button variant="outline" size="sm" onClick={() => downloadFile(`/api/v1/reports/expenses/export?preset=${preset}`, 'expenses-report.csv')}><Download className="h-4 w-4 mr-1.5" />CSV</Button></PageHeader>
    <div className="flex gap-2 flex-wrap">{['this_month', 'last_month', 'this_quarter', 'this_year'].map((p) => (<Button key={p} variant={preset === p ? 'default' : 'outline'} size="sm" onClick={() => setPreset(p)}>{p.replace('_', ' ')}</Button>))}</div>
    <div className="grid gap-3 sm:grid-cols-4">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><FileText className="h-3 w-3 inline mr-1" />Total</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{s?.totalExpenses || 0}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><DollarSign className="h-3 w-3 inline mr-1" />Amount</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(s?.totalAmount || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><CheckCircle2 className="h-3 w-3 inline mr-1" />Paid</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-emerald-600">{formatPkr(s?.paidAmount || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" />Pending</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-amber-600">{formatPkr(s?.pendingAmount || 0)}</p></CardContent></Card>
    </div>
    <DataTable columns={cols} data={data?.items || []} loading={loading} searchKey="expenseNumber" />
  </div>);
}
