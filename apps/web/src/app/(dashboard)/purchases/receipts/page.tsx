'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table'; import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils'; import { Plus } from 'lucide-react';
import Link from 'next/link'; import { ColumnDef } from '@tanstack/react-table';
interface Rec { id: string; receiptNumber: string; orderNumber: string; vendorName: string; receiptDate: string; itemCount: number; }
const cols: ColumnDef<Rec>[] = [
  { accessorKey: 'receiptNumber', header: 'GRN #', cell: ({ row }) => <Link href={`/purchases/receipts/${row.original.id}`} className="text-primary hover:underline font-medium">{row.original.receiptNumber}</Link> },
  { accessorKey: 'orderNumber', header: 'PO #' }, { accessorKey: 'vendorName', header: 'Vendor' },
  { accessorKey: 'receiptDate', header: 'Date', cell: ({ row }) => new Date(row.original.receiptDate).toLocaleDateString() },
  { accessorKey: 'itemCount', header: 'Items' },
];
export default function ReceiptsPage() {
  const [items, setItems] = useState<Rec[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/purchases/receipts').then((r: any) => { if (r?.data) setItems(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return <div className="space-y-6"><PageHeader title="Purchase Receipts" description="Goods received notes"><Button size="sm" asChild><Link href="/purchases/receipts/create"><Plus className="h-4 w-4 mr-1.5" />New Receipt</Link></Button></PageHeader><DataTable columns={cols} data={items} loading={loading} searchKey="receiptNumber" /></div>;
}
