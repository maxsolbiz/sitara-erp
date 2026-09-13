'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export default function ExpenseCategoriesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', description: '' });

  const load = async () => {
    setLoading(true);
    const res = await apiGet('/expenses/categories').catch(() => null);
    if (res?.data) setItems(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', description: '' }); setShowModal(true); };
  const openEdit = (item: any) => { setEditing(item); setForm({ name: item.name, description: item.description || '' }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    try {
      if (editing) {
        const res = await apiPut(`/expenses/categories/${editing.id}`, form) as any;
        if (res.error) { toast.error(res.error.detail); return; }
        toast.success('Category updated');
      } else {
        const res = await apiPost('/expenses/categories', form) as any;
        if (res.error) { toast.error(res.error.detail); return; }
        toast.success('Category created');
      }
      setShowModal(false);
      load();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this category?')) return;
    try {
      const res = await apiDelete(`/expenses/categories/${id}`) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Category deactivated');
      load();
    } catch (err: any) { toast.error(err.message); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Expense Categories" description="Manage expense categories">
      <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />Add Category</Button>
    </PageHeader>
    <div className="rounded-lg border">
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/50">
          <th className="text-left p-3 font-medium">Name</th>
          <th className="text-left p-3 font-medium">Description</th>
          <th className="text-left p-3 font-medium">Expenses</th>
          <th className="text-left p-3 font-medium">Status</th>
          <th className="text-right p-3 font-medium">Actions</th>
        </tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
          : items.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No categories</td></tr>
          : items.map((c) => (
            <tr key={c.id} className="border-b hover:bg-muted/30">
              <td className="p-3 font-medium">{c.name}</td>
              <td className="p-3 text-muted-foreground">{c.description || '-'}</td>
              <td className="p-3">{c.expenseCount}</td>
              <td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.isActive ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
              <td className="p-3 text-right">
                <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{editing ? 'Edit Category' : 'Add Category'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Description</Label><textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <Button className="w-full" onClick={handleSave}>{editing ? 'Update' : 'Create'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
