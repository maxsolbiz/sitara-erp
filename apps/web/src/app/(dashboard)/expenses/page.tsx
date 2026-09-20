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
import { apiGet, apiPost, apiPut, apiPatch, apiDelete, downloadFile } from '@/lib/api'; import { useAuth, hasPermission } from '@/lib/auth';
import { toast } from 'sonner';
import { formatPkr } from '@/lib/utils';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Download, Check, Pencil, Trash2, CreditCard } from 'lucide-react';

interface Exp { id: string; expenseNumber: string; description: string; amount: number; status: string; expenseDate: string; categoryName?: string; categoryId?: string; }
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
  const [editingId, setEditingId] = useState<string | null>(null); const { user } = useAuth();
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
      const res = (editingId ? await apiPut(`/expenses/${editingId}`, { description: form.description, amount: Number(form.amount), categoryId: form.categoryId, expenseDate: form.expenseDate }) : await apiPost('/expenses', { description: form.description, amount: Number(form.amount), categoryId: form.categoryId, expenseDate: form.expenseDate, paymentMethod: form.paymentMethod })) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success(editingId ? 'Expense updated' : 'Expense created');
      setShowModal(false); setEditingId(null);
      setForm({ description: '', amount: '', categoryId: '', expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: 'cash' });
      load();
    } catch (err: any) { toast.error(err.message); }
  };
    const openCreate = () => { setEditingId(null); setForm({ description: '', amount: '', categoryId: '', expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: 'cash' }); setShowModal(true); };
  const openEdit = (e: Exp) => { setEditingId(e.id); setForm({ description: e.description || '', amount: String(e.amount), categoryId: e.categoryId || '', expenseDate: String(e.expenseDate).slice(0, 10), paymentMethod: 'cash' }); setShowModal(true); };
  const act = async (id: string, path: string, okMsg: string) => { try { const res = await apiPatch(`/expenses/${id}/${path}`, {}) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success(okMsg); load(); } catch (err: any) { toast.error(err.message); } };
  const handlePay = (id: string) => { if (confirm('Mark this expense as paid? This posts a journal entry.')) act(id, 'pay', 'Expense paid'); };
  const handleCancel = async (id: string) => { if (!confirm('Cancel this expense?')) return; try { const res = await apiDelete(`/expenses/${id}`) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Expense cancelled'); load(); } catch (err: any) { toast.error(err.message); } };
  const cols: ColumnDef<Exp>[] = [...columns, { id: 'actions', header: '', cell: ({ row }) => { const s = row.original.status; return (<div className="flex gap-1">
    {s === 'PENDING' && hasPermission(user, 'expenses.approve') && <Button variant="ghost" size="sm" aria-label="Approve expense" title="Approve" onClick={() => act(row.original.id, 'approve', 'Expense approved')} className="text-emerald-600"><Check className="h-4 w-4" /></Button>}
    {s === 'APPROVED' && hasPermission(user, 'expenses.pay') && <Button variant="ghost" size="sm" aria-label="Pay expense" title="Pay" onClick={() => handlePay(row.original.id)}><CreditCard className="h-4 w-4" /></Button>}
    {s === 'PENDING' && hasPermission(user, 'expenses.update') && <Button variant="ghost" size="sm" aria-label="Edit expense" title="Edit" onClick={() => openEdit(row.original)}><Pencil className="h-4 w-4" /></Button>}
    {(s === 'PENDING' || s === 'APPROVED') && hasPermission(user, 'expenses.delete') && <Button variant="ghost" size="sm" aria-label="Cancel expense" title="Cancel" onClick={() => handleCancel(row.original.id)} className="text-red-600"><Trash2 className="h-4 w-4" /></Button>}
  </div>); } }];
  return (<div className="space-y-6">
    <PageHeader title="Expenses" description="Track business expenses"><Button variant="outline" size="sm" onClick={() => downloadFile('/api/expenses/export/csv', 'expenses.csv')}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button><Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New Expense</Button></PageHeader>
    <DataTable columns={cols} data={items} loading={loading} searchKey="description" />
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{editingId ? 'Edit Expense' : 'New Expense'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Description *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-2"><Label>Amount *</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-2"><Label>Category *</Label><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}><option value="">Select…</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></div>
          {!editingId && (<div className="space-y-2"><Label>Payment Method</Label><Input value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} /></div>)}
          <Button className="w-full" onClick={handleSave}>{editingId ? 'Save' : 'Create'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
