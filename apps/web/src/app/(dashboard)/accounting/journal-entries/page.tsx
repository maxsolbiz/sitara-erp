'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';

interface JE { id: string; entryNumber: string; entryDate: string; description: string; totalDebit: number; totalCredit: number; isReversed: boolean; }
const columns: ColumnDef<JE>[] = [
  { accessorKey: 'entryNumber', header: 'Entry #', cell: ({ row }) => <Link href={`/accounting/journal-entries/${row.original.id}`} className="text-primary hover:underline font-medium">{row.original.entryNumber}</Link> },
  { accessorKey: 'entryDate', header: 'Date', cell: ({ row }) => new Date(row.original.entryDate).toLocaleDateString() },
  { accessorKey: 'description', header: 'Description', cell: ({ row }) => <span className="truncate max-w-[200px] block">{row.original.description}</span> },
  { accessorKey: 'totalDebit', header: 'Debit', cell: ({ row }) => formatPkr(row.original.totalDebit) },
  { accessorKey: 'totalCredit', header: 'Credit', cell: ({ row }) => formatPkr(row.original.totalCredit) },
  { accessorKey: 'isReversed', header: 'Status', cell: ({ row }) => <Badge variant={row.original.isReversed ? 'secondary' : 'default'}>{row.original.isReversed ? 'Reversed' : 'Active'}</Badge> },
];

export default function JournalEntriesPage() {
  const [items, setItems] = useState<JE[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/accounting/journal-entries').then((r: any) => { if (r?.data) setItems(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return (<div className="space-y-6">
    <PageHeader title="Journal Entries" description="Double-entry accounting records"><Button size="sm" asChild><Link href="/accounting/journal-entries/create"><Plus className="h-4 w-4 mr-1.5" />New Entry</Link></Button></PageHeader>
    <DataTable columns={columns} data={items} loading={loading} searchKey="entryNumber" />
  </div>);
}
