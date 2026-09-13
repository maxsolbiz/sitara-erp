'use client'; import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; import Link from 'next/link';
import { PageHeader } from '@/components/page-header'; import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge'; import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'; import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { apiGet, apiPatch } from '@/lib/api'; import { formatPkr } from '@/lib/utils'; import { ColumnDef } from '@tanstack/react-table'; import { toast } from 'sonner';
import { Check, X } from 'lucide-react';

interface Ret { id: string; returnNumber: string; saleNumber: string; customerName: string; totalAmount: number; status: string; returnDate: string; type: string; }
const sVar: Record<string, 'default'|'secondary'|'destructive'> = { PENDING: 'secondary', APPROVED: 'default', COMPLETED: 'default', REJECTED: 'destructive' };

export default function SalesReturnsPage() {
  const router = useRouter(); const [items, setItems] = useState<Ret[]>([]); const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [showReject, setShowReject] = useState(false); const [rejectTarget, setRejectTarget] = useState<any>(null); const [rejectReason, setRejectReason] = useState('');

  const load = async () => { setLoading(true); const r = await apiGet('/sales-returns').catch(() => null); if (r?.data) setItems(r.data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const filtered = filter === 'ALL' ? items : items.filter((i) => i.status === filter);
  const pendingCount = items.filter((i) => i.status === 'PENDING').length;

  const handleApprove = async (id: string) => { try { const res = await apiPatch(`/sales-returns/${id}/approve`, { refundMethod: 'cash' }) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Return approved'); load(); } catch (err: any) { toast.error(err.message); } };
  const handleReject = async () => { if (!rejectReason) { toast.error('Reason required'); return; } try { const res = await apiPatch(`/sales-returns/${rejectTarget}/reject`, { reason: rejectReason }) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Return rejected'); setShowReject(false); setRejectReason(''); load(); } catch (err: any) { toast.error(err.message); } };

  const columns: ColumnDef<Ret>[] = [
    { accessorKey: 'returnNumber', header: 'Return #', cell: ({ row }) => <Link href={`/sales/returns/${row.original.id}`} className="text-primary hover:underline font-medium">{row.original.returnNumber}</Link> },
    { accessorKey: 'saleNumber', header: 'Sale #' },
    { accessorKey: 'customerName', header: 'Customer' },
    { accessorKey: 'totalAmount', header: 'Amount', cell: ({ row }) => formatPkr(row.original.totalAmount) },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={sVar[row.original.status] || 'outline'}>{row.original.status}</Badge> },
    { accessorKey: 'returnDate', header: 'Date', cell: ({ row }) => new Date(row.original.returnDate).toLocaleDateString() },
    { id: 'actions', header: '', cell: ({ row }) => row.original.status === 'PENDING' ? (<div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => handleApprove(row.original.id)} className="text-emerald-600"><Check className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={() => { setRejectTarget(row.original.id); setShowReject(true); }} className="text-red-600"><X className="h-4 w-4" /></Button></div>) : null },
  ];

  return (<div className="space-y-6">
    <PageHeader title="Sales Returns" description="Manage customer returns"><Button size="sm" asChild><Link href="/sales/returns/create">New Return</Link></Button></PageHeader>
    <div className="flex gap-2 flex-wrap">{['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => (<Button key={s} variant={filter === s ? 'default' : 'outline'} size="sm" onClick={() => setFilter(s)}>{s === 'PENDING' ? `Pending (${pendingCount})` : s}{s === 'ALL' && ` (${items.length})`}</Button>))}</div>
    <DataTable columns={columns} data={filtered} loading={loading} searchKey="returnNumber" />
    <Dialog open={showReject} onOpenChange={setShowReject}>
      <DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>Reject Return</DialogTitle></DialogHeader>
        <div className="space-y-3"><div className="space-y-1"><Label>Reason *</Label><textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this return being rejected?" /></div><Button variant="destructive" className="w-full" onClick={handleReject}>Reject Return</Button></div>
      </DialogContent>
    </Dialog>
  </div>);
}
