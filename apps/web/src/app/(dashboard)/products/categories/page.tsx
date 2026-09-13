'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

export default function CategoriesPage() {
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false); const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', description: '', parentId: '', sortOrder: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); const r = await apiGet('/product-categories?all=true').catch(() => null); if (r?.data) setItems(r.data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', description: '', parentId: '', sortOrder: 0 }); setShowModal(true); };
  const openEdit = (c: any) => { setEditing(c); setForm({ name: c.name, description: c.description || '', parentId: c.parentId || '', sortOrder: c.sortOrder || 0 }); setShowModal(true); };

  const genSlug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editing) { const res = await apiPut(`/product-categories/${editing.id}`, form) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Updated'); }
      else { const res = await apiPost('/product-categories', form) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Created'); }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    try { const res = await apiDelete(`/product-categories/${id}`) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Deleted'); load(); }
    catch (err: any) { toast.error(err.message); }
  };

  const handleToggle = async (id: string) => {
    try { const res = await apiPatch(`/product-categories/${id}/toggle`, {}) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Toggled'); load(); }
    catch (err: any) { toast.error(err.message); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Product Categories" description="Organize your products">
      <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New Category</Button>
    </PageHeader>
    <div className="rounded-lg border">
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/50">
          <th className="text-left p-3 font-medium">Name</th><th className="text-left p-3 font-medium">Slug</th>
          <th className="text-left p-3 font-medium">Products</th><th className="text-left p-3 font-medium">Status</th>
          <th className="text-right p-3 font-medium">Actions</th>
        </tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="p-8 text-center">Loading...</td></tr>
          : items.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No categories</td></tr>
          : items.map((c) => (
            <tr key={c.id} className="border-b hover:bg-muted/30">
              <td className="p-3 font-medium">{c.parentId ? <span className="text-muted-foreground mr-1">└</span> : ''}{c.name}</td>
              <td className="p-3 text-xs text-muted-foreground">{c.slug || '-'}</td>
              <td className="p-3">{c.productCount}</td>
              <td className="p-3"><Badge variant={c.isActive ? 'default' : 'secondary'}>{c.isActive ? 'Active' : 'Inactive'}</Badge></td>
              <td className="p-3 text-right space-x-1">
                <Button variant="ghost" size="sm" onClick={() => handleToggle(c.id)}>{c.isActive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}</Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} disabled={c.productCount > 0} title={c.productCount > 0 ? 'Has products' : ''}><Trash2 className={`h-3.5 w-3.5 ${c.productCount > 0 ? 'text-gray-300' : 'text-red-500'}`} /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{editing ? 'Edit Category' : 'New Category'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); }} /></div>
          {form.name && <p className="text-xs text-muted-foreground">URL slug: {genSlug(form.name)}</p>}
          <div className="space-y-1"><Label>Parent Category</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">None (top level)</option>
              {items.filter((c) => c.id !== editing?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>Description</Label><textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-1"><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
