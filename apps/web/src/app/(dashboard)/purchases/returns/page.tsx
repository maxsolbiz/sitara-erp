'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge'; import { DataTable } from '@/components/data-table';
import { apiGet } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { Plus } from 'lucide-react'; import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
interface PRet { id: string; returnNumber: string; vendorName: string; returnDate: string; totalAmount: number; reason: string; status: string; itemCount: number; }
const sVar: Record<string, 'default'|'secondary'|'destructive'> = { PENDING: 'secondary', APPROVED: 'default', REJECTED: 'destructive' };
const cols: ColumnDef<PRet>[] = [
  { accessorKey: 'returnNumber', header: 'Return #' }, { accessorKey: 'vendorName', header: 'Vendor' },
  { accessorKey: 'totalAmount', header: 'Amount', cell: ({ row }) => formatPkr(row.original.totalAmount) },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={sVar[row.original.status] || 'outline'}>{row.original.status}</Badge> },
  { accessorKey: 'returnDate', header: 'Date', cell: ({ row }) => new Date(row.original.returnDate).toLocaleDateString() },
  { accessorKey: 'itemCount', header: 'Items' },
];
export default function PurchaseReturnsPage() {
  const [items, setItems] = useState<PRet[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/purchases/returns').then((r: any) => { if (r?.data) setItems(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return <div className="space-y-6"><PageHeader title="Purchase Returns" description="Returns to vendors"><Button size="sm" asChild><Link href="/purchases/returns/create"><Plus className="h-4 w-4 mr-1.5" />New Return</Link></Button></PageHeader><DataTable columns={cols} data={items} loading={loading} searchKey="returnNumber" /></div>;
}
