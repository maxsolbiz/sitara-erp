'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Link from 'next/link';
import { apiGet, apiPost, downloadFile } from '@/lib/api';
import { toast } from 'sonner';
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
  const [showModal, setShowModal] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [form, setForm] = useState({ description: '', amount: '', categoryId: '', expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: 'cash' });
  const load = async () => {
    const res = await apiGet('/expenses').catch(() => null);
    if (res?.data) setItems(res.data);
    setLoading(false);
  };
  useEffect(() => { load(); apiGet('/expenses/categories').then((r: any) => { if (r?.data) setCategories(r.data); }).catch(() => {}); }, []);
  const handleSave = async () => {
    if (!form.description || !form.amount || Number(form.amount) <= 0 || !form.categoryId) { toast.error('Description, positive amount, and category required'); return; }
    try {
      const res = await apiPost('/expenses', { description: form.description, amount: Number(form.amount), categoryId: form.categoryId, expenseDate: form.expenseDate, paymentMethod: form.paymentMethod }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Expense created');
      setShowModal(false);
      setForm({ description: '', amount: '', categoryId: '', expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: 'cash' });
      load();
    } catch (err: any) { toast.error(err.message); }
  };
  return (<div className="space-y-6">
    <PageHeader title="Expenses" description="Track business expenses"><Button variant="outline" size="sm" onClick={() => downloadFile('/api/expenses/export/csv', 'expenses.csv')}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button><Button size="sm" onClick={() => setShowModal(true)}><Plus className="h-4 w-4 mr-1.5" />New Expense</Button></PageHeader>
    <DataTable columns={columns} data={items} loading={loading} searchKey="description" />
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>New Expense</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Description *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-2"><Label>Amount *</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-2"><Label>Category *</Label><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}><option value="">Select…</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></div>
          <div className="space-y-2"><Label>Payment Method</Label><Input value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} /></div>
          <Button className="w-full" onClick={handleSave}>Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
