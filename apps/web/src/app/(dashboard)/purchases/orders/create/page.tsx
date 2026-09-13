'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGet, apiPost } from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Save, Plus, Trash2, Search } from 'lucide-react';

export default function CreatePODashboardPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ productId: number; name: string; quantityOrdered: number; unitCost: number }[]>([]);

  useEffect(() => {
    apiGet('/vendors').then((r: any) => { if (r?.data) setVendors(r.data); }).catch(() => {});
    apiGet('/products').then((r: any) => { if (r?.data) setProducts(r.data); }).catch(() => {});
  }, []);

  const addItem = () => setItems([...items, { productId: 0, name: '', quantityOrdered: 1, unitCost: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[i] as any)[field] = value;
    if (field === 'productId') {
      const p = products.find((pr) => pr.id == value);
      if (p) { newItems[i].name = p.name; newItems[i].unitCost = Number(p.costPrice) || 0; }
    }
    setItems(newItems);
  };

  const total = items.reduce((s, i) => s + (i.quantityOrdered * i.unitCost), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId) { toast.error('Select a vendor'); return; }
    if (items.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      const res = await apiPost('/purchases/orders', { vendorId: Number(vendorId), notes, items }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Purchase order created'); router.push('/purchases/orders');
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Create Purchase Order" description="New procurement order">
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
    </PageHeader>
    <form onSubmit={handleSubmit}>
      <Card className="mb-6"><CardHeader><CardTitle className="text-lg">Order Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Vendor *</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>{vendors.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.companyName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </CardContent>
      </Card>
      <Card className="mb-6"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-lg">Items</CardTitle><Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-4 w-4 mr-1" />Add Item</Button></CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground py-4">No items. Click "Add Item" to start.</p>}
          {items.map((item, i) => (<div key={i} className="flex items-end gap-2 border-b pb-2">
            <div className="flex-1 space-y-1"><Label className="text-xs">Product</Label>
              <Select value={String(item.productId)} onValueChange={(v) => updateItem(i, 'productId', Number(v))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="w-20 space-y-1"><Label className="text-xs">Qty</Label><Input type="number" className="h-9" value={item.quantityOrdered} onChange={(e) => updateItem(i, 'quantityOrdered', Number(e.target.value))} min={1} /></div>
            <div className="w-24 space-y-1"><Label className="text-xs">Unit Cost</Label><Input type="number" className="h-9" value={item.unitCost} onChange={(e) => updateItem(i, 'unitCost', Number(e.target.value))} min={0} /></div>
            <div className="w-20 space-y-1"><Label className="text-xs">Total</Label><p className="h-9 flex items-center text-sm font-medium">{item.unitCost * item.quantityOrdered}</p></div>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>))}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold">Total: {total.toFixed(2)}</p>
        <Button type="submit" disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? 'Creating...' : 'Create Purchase Order'}</Button>
      </div>
    </form>
  </div>);
}
