'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import { toast } from 'sonner'; { }
import { Plus, Check } from 'lucide-react';

const sVar: Record<string, 'default'|'secondary'> = { APPROVED: 'default', PENDING: 'secondary' };

export default function AdjustmentsPage() {
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ warehouseId: '', reason: '', items: [{ productId: '', productName: '', quantityBefore: 0, quantityAfter: 0, reason: '' }] });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [aRes, wRes, pRes] = await Promise.all([apiGet('/inventory/adjustments'), apiGet('/inventory/warehouses'), apiGet('/products/search?q=')]);
    if (aRes?.data) setItems(aRes.data);
    if (wRes?.data) setWarehouses(wRes.data);
    if (pRes?.data) setProducts(pRes.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ warehouseId: '', reason: '', items: [{ productId: '', productName: '', quantityBefore: 0, quantityAfter: 0, reason: '' }] }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.warehouseId) { toast.error('Select warehouse'); return; }
    setSaving(true);
    try {
      const res = await apiPost('/inventory/adjustments', { ...form, warehouseId: Number(form.warehouseId) }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Adjustment created'); setShowModal(false); load();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const handleApprove = async (id: string) => {
    try { const res = await apiPatch(`/inventory/adjustments/${id}/approve`, {}) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Approved'); load(); }
    catch (err: any) { toast.error(err.message); }
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { productId: '', productName: '', quantityBefore: 0, quantityAfter: 0, reason: '' }] });
  const updateItem = (idx: number, field: string, value: any) => {
    const items = [...form.items]; items[idx] = { ...items[idx], [field]: value }; setForm({ ...form, items });
  };

  return (<div className="space-y-6">
    <PageHeader title="Stock Adjustments" description="Record stock corrections">
      <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New Adjustment</Button>
    </PageHeader>
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/50"><th className="text-left p-3">Product</th><th className="text-left p-3">Warehouse</th><th className="text-right p-3">Before</th><th className="text-right p-3">Adjusted</th><th className="text-right p-3">After</th><th className="text-left p-3">Status</th><th className="text-right p-3">Actions</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={7} className="p-8 text-center">Loading...</td></tr> : items.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No adjustments</td></tr> : items.map((a: any) => (<tr key={a.id} className="border-b">
        <td className="p-3 font-medium">{a.productName}</td><td className="p-3">{a.warehouseName}</td>
        <td className="p-3 text-right">{a.quantityBefore}</td><td className="p-3 text-right">{a.adjustmentType === 'DECREASE' ? '-' : '+'}{a.quantityAdjusted}</td>
        <td className="p-3 text-right">{a.quantityAfter}</td>
        <td className="p-3"><Badge variant={sVar[a.status] || 'outline'}>{a.status}</Badge></td>
        <td className="p-3 text-right">{a.status === 'PENDING' && <Button variant="ghost" size="sm" onClick={() => handleApprove(a.id)}><Check className="h-3.5 w-3.5 text-emerald-500" /></Button>}</td>
      </tr>))}</tbody></table></div></CardContent></Card>

    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New Stock Adjustment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Warehouse</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}><option value="">Select...</option>{warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
          </div>
          {form.items.map((item: any, idx: number) => (<div key={idx} className="border rounded p-3 space-y-2">
            <div className="space-y-1"><Label>Product</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={item.productId} onChange={(e) => updateItem(idx, 'productId', e.target.value)}><option value="">Select...</option>{products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>Current Qty</Label><Input type="number" value={item.quantityBefore} onChange={(e) => updateItem(idx, 'quantityBefore', Number(e.target.value))} /></div>
              <div className="space-y-1"><Label>New Qty</Label><Input type="number" value={item.quantityAfter} onChange={(e) => updateItem(idx, 'quantityAfter', Number(e.target.value))} /></div>
            </div>
          </div>))}
          <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add Item</Button>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Creating...' : 'Create Adjustment'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
