'use client'; import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; import { apiGet } from '@/lib/api';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/data-table'; import { formatPkr } from '@/lib/utils';
import { ArrowLeft, Printer } from 'lucide-react'; import { ColumnDef } from '@tanstack/react-table';

export default function AccountDetailPage() {
  const params = useParams(); const router = useRouter();
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet(`/accounting/general-ledger/${params.accountId}`).then((r: any) => { if (r?.data) setData(r.data); setLoading(false); }).catch(() => setLoading(false)); }, [params.accountId]);
  const cols: ColumnDef<any>[] = [
    { accessorKey: 'date', header: 'Date', cell: ({ row }) => new Date(row.original.date).toLocaleDateString() },
    { accessorKey: 'entryNumber', header: 'Entry #' },
    { accessorKey: 'description', header: 'Description' },
    { accessorKey: 'debit', header: 'Debit', cell: ({ row }) => row.original.debit > 0 ? formatPkr(row.original.debit) : '-' },
    { accessorKey: 'credit', header: 'Credit', cell: ({ row }) => row.original.credit > 0 ? formatPkr(row.original.credit) : '-' },
    { accessorKey: 'balance', header: 'Balance', cell: ({ row }) => <span className={row.original.balance < 0 ? 'text-red-600 font-medium' : 'text-blue-600 font-medium'}>{formatPkr(row.original.balance)}</span> },
  ];
  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!data) return <div className="text-center py-12 text-muted-foreground">Not found</div>;
  return (<div className="space-y-6">
    <PageHeader title={data.account?.name} description={`${data.account?.code} — ${data.account?.type}`}>
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
    </PageHeader>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Opening Balance</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(data.openingBalance)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Debits / Credits</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{formatPkr(data.totalDebits)} / {formatPkr(data.totalCredits)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Closing Balance</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(data.closingBalance)}</p></CardContent></Card>
    </div>
    <DataTable columns={cols} data={data.transactions || []} loading={loading} searchKey="entryNumber" />
  </div>);
}
