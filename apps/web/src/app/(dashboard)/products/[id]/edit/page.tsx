'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';
import { useAuth, hasPermission } from '@/lib/auth';

export default function EditProductPage() {
  const { user } = useAuth();
  const params = useParams(); const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', categoryId: 0, unitOfMeasure: 'pieces',
    costPrice: 0, sellingPrice: 0, taxRate: 0, reorderLevel: 10, reorderQuantity: 50,
    description: '', isActive: true, isTrackInventory: true,
  });

  useEffect(() => {
    apiGet('/product-categories').then((r: any) => { if (r?.data) setCategories(r.data); }).catch(() => {});
    apiGet(`/products/${params.id}`).then((r: any) => {
      if (r?.data) {
        setForm({
          name: r.data.name, sku: r.data.sku, barcode: r.data.barcode || '',
          categoryId: r.data.categoryId ? Number(r.data.categoryId) : 0,
          unitOfMeasure: r.data.unitOfMeasure, costPrice: Number(r.data.costPrice),
          sellingPrice: Number(r.data.sellingPrice), taxRate: Number(r.data.taxRate),
          reorderLevel: r.data.reorderLevel, reorderQuantity: r.data.reorderQuantity,
          description: r.data.description || '', isActive: r.data.isActive, isTrackInventory: r.data.isTrackInventory,
        });
      }
    }).catch(() => { toast.error('Failed to load product'); router.push('/products'); });
  }, [params.id, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const r: any = await apiPut(`/products/${params.id}`, form);
      if (!r?.ok && !r?.data) { toast.error(r?.error?.detail || 'Failed to update'); return; }
      toast.success('Product updated'); router.push(`/products/${params.id}`);
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Edit Product" description={form.name}>
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
    </PageHeader>
    <form onSubmit={handleSubmit}><div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <Card><CardHeader><CardTitle className="text-lg">Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Product Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
              {hasPermission(user, 'products.update') && (
                <div className="space-y-2"><Label>Barcode</Label><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Category</Label><Select value={String(form.categoryId)} onValueChange={(v) => setForm({ ...form, categoryId: Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">Uncategorized</SelectItem>{categories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Unit</Label><Select value={form.unitOfMeasure} onValueChange={(v) => setForm({ ...form, unitOfMeasure: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['pieces','kg','g','l','ml','m','box','pack'].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-lg">Pricing & Tax</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {hasPermission(user, 'products.update') && (
              <div className="space-y-2"><Label>Cost Price</Label><Input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} /></div>
            )}
            {hasPermission(user, 'products.update') && (
              <div className="space-y-2"><Label>Selling Price</Label><Input type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })} /></div>
            )}
            {hasPermission(user, 'products.update') && (
              <div className="space-y-2"><Label>Tax Rate (%)</Label><Input type="number" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })} /></div>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-6">
        <Card><CardHeader><CardTitle className="text-lg">Status</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {hasPermission(user, 'products.update') && (
              <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} /></div>
            )}
            <div className="flex items-center justify-between"><Label>Track Inventory</Label><Switch checked={form.isTrackInventory} onCheckedChange={(v) => setForm({ ...form, isTrackInventory: v })} /></div>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-lg">Inventory</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Reorder Level</Label><Input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} /></div>
            <div className="space-y-2"><Label>Reorder Qty</Label><Input type="number" value={form.reorderQuantity} onChange={(e) => setForm({ ...form, reorderQuantity: Number(e.target.value) })} /></div>
          </CardContent>
        </Card>
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 text-center">Variants are managed from the product detail page → Variants tab.</div>
        <Button type="submit" className="w-full" disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Changes'}</Button>
      </div>
    </div></form>
  </div>);
}
