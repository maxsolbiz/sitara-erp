'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { apiGet, downloadFile } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Download } from 'lucide-react';

interface Exp { id: string; expenseNumber: string; description: string; amount: number; status: string; expenseDate: string; categoryName?: string; }
const sVar: Record<string, 'default'|'secondary'|'destructive'|'outline'> = { PENDING: 'secondary', APPROVED: 'default', PAID: 'default', REJECTED: 'destructive' };
const columns: ColumnDef<Exp>[] = [
  { accessorKey: 'expenseNumber', header: 'Expense #' },
  { accessorKey: 'description', header: 'Description', cell: ({ row }) => <span className="truncate max-w-[200px] block">{row.original.description}</span> },
  { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => formatPkr(row.original.amount) },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={sVar[row.original.status] || 'outline'}>{row.original.status}</Badge> },
  { accessorKey: 'expenseDate', header: 'Date', cell: ({ row }) => new Date(row.original.expenseDate).toLocaleDateString() },
];

export default function ExpensesPage() {
  const [items, setItems] = useState<Exp[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/expenses').then((r: any) => { if (r?.data) setItems(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return (<div className="space-y-6">
    <PageHeader title="Expenses" description="Track business expenses"><Button variant="outline" size="sm" onClick={() => downloadFile('/api/expenses/export/csv', 'expenses.csv')}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button><Button size="sm"><Plus className="h-4 w-4 mr-1.5" />New Expense</Button></PageHeader>
    <DataTable columns={columns} data={items} loading={loading} searchKey="description" />
  </div>);
}
