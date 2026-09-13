'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export default function AttributesPage() {
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false); const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', valueInput: '', values: [] as string[] });
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); const r = await apiGet('/products/attributes').catch(() => null); if (r?.data) setItems(r.data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', valueInput: '', values: [] }); setShowModal(true); };
  const openEdit = (a: any) => { setEditing(a); setForm({ name: a.name, valueInput: '', values: a.values || [] }); setShowModal(true); };

  const addValue = () => { if (form.valueInput && !form.values.includes(form.valueInput)) { setForm({ ...form, values: [...form.values, form.valueInput], valueInput: '' }); } };
  const removeValue = (v: string) => setForm({ ...form, values: form.values.filter((x) => x !== v) });

  const handleSave = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      if (editing) { const res = await apiPut(`/products/attributes/${editing.id}`, { name: form.name, values: form.values }) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Updated'); }
      else { const res = await apiPost('/products/attributes', { name: form.name, values: form.values }) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Created'); }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => { if (!confirm('Delete this attribute?')) return; try { const res = await apiDelete(`/products/attributes/${id}`) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Deleted'); load(); } catch (err: any) { toast.error(err.message); } };

  return (<div className="space-y-6">
    <PageHeader title="Product Attributes" description="Manage attributes like Size, Color"><Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New Attribute</Button></PageHeader>
    <div className="rounded-lg border">
      <table className="w-full text-sm"><thead><tr className="border-b bg-muted/50"><th className="text-left p-3 font-medium">Name</th><th className="text-left p-3 font-medium">Values</th><th className="text-left p-3 font-medium">Status</th><th className="text-right p-3 font-medium">Actions</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={4} className="p-8 text-center">Loading...</td></tr> : items.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No attributes</td></tr> : items.map((a) => (<tr key={a.id} className="border-b hover:bg-muted/30">
          <td className="p-3 font-medium">{a.name}</td>
          <td className="p-3"><div className="flex gap-1 flex-wrap">{a.values.map((v: string) => <span key={v} className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs">{v}</span>)}</div></td>
          <td className="p-3"><Badge variant={a.isActive ? 'default' : 'secondary'}>{a.isActive ? 'Active' : 'Inactive'}</Badge></td>
          <td className="p-3 text-right space-x-1"><Button variant="ghost" size="sm" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button></td>
        </tr>))}</tbody>
      </table>
    </div>
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{editing ? 'Edit Attribute' : 'New Attribute'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Color" /></div>
          <div className="space-y-1"><Label>Values</Label>
            <div className="flex gap-2"><Input value={form.valueInput} onChange={(e) => setForm({ ...form, valueInput: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addValue())} placeholder="Type and press Enter to add" /><Button variant="outline" size="sm" onClick={addValue}>Add</Button></div>
            <div className="flex gap-1 flex-wrap mt-1">{form.values.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">{v}<button onClick={() => removeValue(v)} className="text-red-500 ml-1">×</button></span>)}</div>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
