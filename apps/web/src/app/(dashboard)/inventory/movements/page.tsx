'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { ColumnDef } from '@tanstack/react-table';

interface Movement { id: string; movementType: string; productName: string; warehouseName: string; quantity: number; createdAt: string; }
const typeColors: Record<string, string> = { PURCHASE_IN: 'text-emerald-600 bg-emerald-50', SALE_OUT: 'text-red-600 bg-red-50', ADJUSTMENT_IN: 'text-blue-600 bg-blue-50', ADJUSTMENT_OUT: 'text-amber-600 bg-amber-50', TRANSFER_IN: 'text-cyan-600 bg-cyan-50', TRANSFER_OUT: 'text-orange-600 bg-orange-50', SALE_RETURN: 'text-purple-600 bg-purple-50', PURCHASE_RETURN: 'text-pink-600 bg-pink-50', OPENING_STOCK: 'text-gray-600 bg-gray-50' };
const columns: ColumnDef<Movement>[] = [
  { accessorKey: 'createdAt', header: 'Date', cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
  { accessorKey: 'productName', header: 'Product' },
  { accessorKey: 'warehouseName', header: 'Warehouse' },
  { accessorKey: 'movementType', header: 'Type', cell: ({ row }) => <Badge variant="outline" className={typeColors[row.original.movementType] || ''}>{row.original.movementType.replace(/_/g, ' ')}</Badge> },
  { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => <span className={row.original.quantity > 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>{row.original.quantity > 0 ? `+${row.original.quantity}` : row.original.quantity}</span> },
];

export default function MovementsPage() {
  const [items, setItems] = useState<Movement[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/inventory/movements').then((r: any) => { if (r?.data) setItems(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return (<div className="space-y-6">
    <PageHeader title="Stock Movements" description="All inventory transactions" />
    <DataTable columns={columns} data={items} loading={loading} pageSize={25} />
  </div>);
}
