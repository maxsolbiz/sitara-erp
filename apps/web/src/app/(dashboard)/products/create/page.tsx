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
import { Switch } from '@/components/ui/switch';
import { apiGet, apiPost } from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Save, RefreshCw, Sparkles } from 'lucide-react';

export default function CreateProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', categoryId: 0,
    costPrice: 0, sellingPrice: 0, taxRate: 0,
    unitOfMeasure: 'pieces', reorderLevel: 10, reorderQuantity: 50,
    description: '', isActive: true, isTrackInventory: true,
  });

  const profitMargin = form.sellingPrice > 0 && form.costPrice > 0
    ? Math.round(((form.sellingPrice - form.costPrice) / form.sellingPrice) * 100)
    : 0;

  useEffect(() => {
    apiGet('/product-categories').then((res: any) => {
      if (res?.data) setCategories(res.data);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiPost('/products', { ...form, categoryId: form.categoryId || undefined }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Product created successfully');
      router.push('/products');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create product');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!form.name) { toast.error('Enter product name first'); return; }
    setGenerating(true);
    try {
      const res = await fetch('/api/v1/ai/product-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: JSON.stringify({ name: form.name, category: form.categoryId ? 'selected' : '', price: form.sellingPrice }),
      });
      const json = await res.json();
      if (json?.data?.description) setForm(f => ({ ...f, description: json.data.description }));
      else toast.error(json?.error || 'Failed to generate');
    } catch { toast.error('AI generation failed'); }
    finally { setGenerating(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Add Product" description="Create a new product">
        <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
      </PageHeader>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-lg">Basic Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Product Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Enter product name" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>SKU</Label>
                    <div className="flex gap-2">
                      <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Auto-generated" />
                      <Button type="button" variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Barcode</Label>
                    <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Optional" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={String(form.categoryId)} onValueChange={(v) => setForm({ ...form, categoryId: Number(v) })}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Uncategorized</SelectItem>
                        {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Unit of Measure</Label>
                    <Select value={form.unitOfMeasure} onValueChange={(v) => setForm({ ...form, unitOfMeasure: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['pieces', 'kg', 'g', 'lb', 'oz', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'dozen'].map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleGenerateDescription} disabled={generating} className="mb-2">
                    <Sparkles className="h-4 w-4 mr-1.5" />{generating ? 'Generating...' : 'Generate with AI'}
                  </Button>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Product description..." />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Pricing & Tax</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cost Price (PKR) *</Label>
                  <Input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} required min={0} />
                </div>
                <div className="space-y-2">
                  <Label>Selling Price (PKR) *</Label>
                  <Input type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })} required min={0} />
                </div>
                <div className="space-y-2">
                  <Label>Tax Rate (%)</Label>
                  <Input type="number" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })} min={0} max={100} />
                </div>
                <div className="space-y-2 flex flex-col justify-end">
                  <div className={`rounded-lg border p-3 text-center ${profitMargin > 0 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800' : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'}`}>
                    <p className="text-sm text-muted-foreground">Profit Margin</p>
                    <p className={`text-xl font-bold ${profitMargin > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{profitMargin}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-lg">Status</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Track Inventory</Label>
                  <Switch checked={form.isTrackInventory} onCheckedChange={(v) => setForm({ ...form, isTrackInventory: v })} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Inventory Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Reorder Level</Label>
                  <Input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} min={0} />
                </div>
                <div className="space-y-2">
                  <Label>Reorder Quantity</Label>
                  <Input type="number" value={form.reorderQuantity} onChange={(e) => setForm({ ...form, reorderQuantity: Number(e.target.value) })} min={0} />
                </div>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" disabled={saving}>
              <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Product'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
