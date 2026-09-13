'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label'; import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable } from '@/components/data-table'; import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from '@/lib/api';
import { formatPkr } from '@/lib/utils'; import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'; import { ColumnDef } from '@tanstack/react-table';

export default function BundlesPage() {
  const [items, setItems] = useState<any[]>([]); const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', sku: '', sellingPrice: 0, description: '', items: [] as any[] });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [b, p] = await Promise.all([apiGet('/products/bundles'), apiGet('/products/search?q=')]);
    if (b?.data) setItems(b.data); if (p?.data) setProducts(p.data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', sku: '', sellingPrice: 0, description: '', items: [] }); setShowModal(true); };
  const openEdit = (b: any) => { setEditing(b); setForm({ name: b.name, sku: b.sku, sellingPrice: b.sellingPrice, description: '', items: (b.items || []).map((i: any) => ({ productId: Number(i.productId), productName: i.productName, quantity: i.quantity })) }); setShowModal(true); };

  const addItem = () => setForm({ ...form, items: [...form.items, { productId: '', productName: '', quantity: 1 }] });
  const updateItem = (idx: number, field: string, val: any) => { const items = [...form.items]; items[idx] = { ...items[idx], [field]: val }; setForm({ ...form, items }); };
  const removeItem = (idx: number) => setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) });

  const handleSave = async () => {
    if (!form.name || !form.sku || form.items.length === 0) { toast.error('Name, SKU, and items required'); return; }
    setSaving(true);
    try {
      if (editing) { const res = await apiPut(`/products/bundles/${editing.id}`, form) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Updated'); }
      else { const res = await apiPost('/products/bundles', form) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Created'); }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => { if (!confirm('Delete this bundle?')) return; try { const res = await apiDelete(`/products/bundles/${id}`) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Deleted'); load(); } catch (err: any) { toast.error(err.message); } };
  const handleToggle = async (id: string) => { try { const res = await apiPatch(`/products/bundles/${id}/toggle`, {}) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Toggled'); load(); } catch (err: any) { toast.error(err.message); } };

  const cols: ColumnDef<any>[] = [
    { accessorKey: 'name', header: 'Name' }, { accessorKey: 'sku', header: 'SKU' },
    { accessorKey: 'itemCount', header: 'Items', cell: ({ row }) => <Badge variant="secondary">{row.original.itemCount}</Badge> },
    { accessorKey: 'sellingPrice', header: 'Price', cell: ({ row }) => formatPkr(row.original.sellingPrice) },
    { accessorKey: 'isActive', header: 'Status', cell: ({ row }) => <Badge variant={row.original.isActive ? 'default' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge> },
    { id: 'actions', header: '', cell: ({ row }) => (<div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => handleToggle(row.original.id)}>{row.original.isActive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}</Button><Button variant="ghost" size="sm" onClick={() => openEdit(row.original)}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" onClick={() => handleDelete(row.original.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button></div>) },
  ];

  return (<div className="space-y-6">
    <PageHeader title="Product Bundles" description="Combo deals and product sets"><Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New Bundle</Button></PageHeader>
    <DataTable columns={cols} data={items} loading={loading} searchKey="name" />
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? 'Edit Bundle' : 'New Bundle'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div className="space-y-1"><Label>SKU *</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div></div>
          <div className="space-y-1"><Label>Selling Price (PKR)</Label><Input type="number" value={form.sellingPrice || ''} onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label className="font-medium">Bundle Items</Label>
            {form.items.map((item: any, idx: number) => (<div key={idx} className="flex gap-2 items-end border rounded p-2">
              <div className="flex-1"><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={item.productId} onChange={(e) => { const p = products.find((x: any) => x.id === e.target.value); updateItem(idx, 'productId', e.target.value); updateItem(idx, 'productName', p?.name || ''); }}><option value="">Select...</option>{products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="w-20"><Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} /></div>
              <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-500">×</Button>
            </div>))}
            <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add Item</Button>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update Bundle' : 'Create Bundle'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
