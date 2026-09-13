'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/data-table'; import { apiGet } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { ColumnDef } from '@tanstack/react-table'; import Link from 'next/link';
import { Download } from 'lucide-react';

export default function GeneralLedgerPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/accounting/general-ledger').then((r: any) => { if (r?.data) setData(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  const cols: ColumnDef<any>[] = [
    { accessorKey: 'accountCode', header: 'Code' },
    { accessorKey: 'accountName', header: 'Account', cell: ({ row }) => <Link href={`/accounting/general-ledger/${row.original.accountId}`} className="text-primary hover:underline font-medium">{row.original.accountName}</Link> },
    { accessorKey: 'accountType', header: 'Type' },
    { accessorKey: 'openingBalance', header: 'Opening', cell: ({ row }) => formatPkr(row.original.openingBalance) },
    { accessorKey: 'totalDebits', header: 'Debits', cell: ({ row }) => formatPkr(row.original.totalDebits) },
    { accessorKey: 'totalCredits', header: 'Credits', cell: ({ row }) => formatPkr(row.original.totalCredits) },
    { accessorKey: 'closingBalance', header: 'Balance', cell: ({ row }) => <span className={row.original.closingBalance < 0 ? 'text-red-600' : ''}>{formatPkr(row.original.closingBalance)}</span> },
  ];
  return (<div className="space-y-6">
    <PageHeader title="General Ledger" description="All accounts with running balances">
      <Button variant="outline" size="sm" onClick={() => { const csv = [['Code','Account','Type','Opening','Debits','Credits','Balance'].join(',')]; data?.accounts?.forEach((a: any) => csv.push([a.accountCode, `"${a.accountName}"`, a.accountType, a.openingBalance, a.totalDebits, a.totalCredits, a.closingBalance].join(','))); const b = new Blob([csv.join('\n')], { type: 'text/csv' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'general-ledger.csv'; a.click(); }}><Download className="h-4 w-4 mr-1.5" />CSV</Button>
    </PageHeader>
    <DataTable columns={cols} data={data?.accounts || []} loading={loading} searchKey="accountName" />
  </div>);
}
