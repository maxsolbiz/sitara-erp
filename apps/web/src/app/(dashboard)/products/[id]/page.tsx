'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth, hasPermission } from '@/lib/auth';
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { toast } from 'sonner';
import { Breadcrumb } from '@/components/breadcrumb';
import { ArrowLeft, DollarSign, Tag, Warehouse, Package, Star, Trash2, Upload, ImageIcon, Layers } from 'lucide-react';
import { DetailPageSkeleton } from '@/components/skeletons';

export default function ProductDetailPage() {
  const params = useParams(); const router = useRouter();
  const { user } = useAuth();
  const [product, setProduct] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('details');
  const [newVariant, setNewVariant] = useState<any>(null);
  const [editingVariant, setEditingVariant] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  const loadProduct = async () => {
    const res = await apiGet(`/products/${params.id}`).catch(() => null);
    if (res?.data) setProduct(res.data);
    setLoading(false);
  };

  const loadVariants = async () => {
    const res = await apiGet(`/products/${params.id}/variants`).catch(() => null);
    if (res?.data) setVariants(res.data);
  };

  const loadImages = async () => {
    const res = await apiGet(`/products/${params.id}/images`).catch(() => null);
    if (res?.data) setImages(res.data);
  };

  useEffect(() => {
    loadProduct();
    loadVariants();
    loadImages();
  }, [params.id]);

  const handleAddVariant = async () => {
    if (!newVariant?.sku || !newVariant?.name) { toast.error('SKU and name required'); return; }
    try {
      const res = await apiPost(`/products/${params.id}/variants`, newVariant) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Variant added'); setNewVariant(null); loadVariants();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleEditVariant = async () => {
    if (!editingVariant) return;
    try {
      const res = await apiPut(`/products/${params.id}/variants/${editingVariant.id}`, editingVariant) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Variant updated'); setEditingVariant(null); loadVariants();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!confirm('Delete this variant?')) return;
    try {
      const res = await apiDelete(`/products/${params.id}/variants/${variantId}`) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Variant deleted'); loadVariants();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return; }
    setUploading(true);
    try {
      const form = new FormData(); form.append('image', file);
      const res = await fetch(`/api/v1/products/${params.id}/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: form,
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error.detail); return; }
      toast.success('Image uploaded'); loadImages(); loadProduct();
    } catch (err: any) { toast.error(err.message); } finally { setUploading(false); }
  };

  const handleSetPrimary = async (imageId: string) => {
    try {
      const res = await apiPatch(`/products/${params.id}/images/${imageId}/primary`, {}) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Primary image updated'); loadImages(); loadProduct();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm('Delete this image?')) return;
    try {
      const res = await apiDelete(`/products/${params.id}/images/${imageId}`) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Image deleted'); loadImages(); loadProduct();
    } catch (err: any) { toast.error(err.message); }
  };

  const totalStock = product?.warehouseStock?.reduce((s: number, ws: any) => s + ws.quantity, 0) || 0;

  if (loading) return <DetailPageSkeleton />;
  if (!product) return <div className="text-center py-12 text-muted-foreground">Product not found</div>;

  const primaryImage = images.find((img) => img.isPrimary);

  return (<div className="space-y-6">
    <Breadcrumb dynamicLabels={{ [params.id as string]: product?.name }} />
    <PageHeader title={product.name} description={`SKU: ${product.sku}`}>
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
      {hasPermission(user, 'products.update') && <Button size="sm" onClick={() => router.push(`/products/${params.id}/edit`)}>Edit</Button>}
    </PageHeader>

    {/* Product Header with Primary Image */}
    <div className="flex items-center gap-4">
      {primaryImage ? (
        <img src={primaryImage.imagePath} alt={product.name} className="h-20 w-20 rounded-lg object-cover border" />
      ) : (
        <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center"><Package className="h-8 w-8 text-muted-foreground" /></div>
      )}
      <div>
        <p className="text-sm text-muted-foreground">{product.category?.name || 'Uncategorized'}</p>
        <Badge variant={product.isActive ? 'default' : 'secondary'}>{product.isActive ? 'Active' : 'Inactive'}</Badge>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Selling Price" value={formatPkr(product.sellingPrice)} icon={DollarSign} variant="primary" />
      {product.costPrice !== null && product.costPrice !== undefined && (
        <StatCard title="Cost Price" value={formatPkr(product.costPrice)} icon={Tag} variant="info" />
      )}
      <StatCard title="Stock" value={totalStock} icon={Warehouse} variant={totalStock <= product.reorderLevel ? 'warning' : 'success'} />
      <StatCard title="Status" value={product.isActive ? 'Active' : 'Inactive'} icon={Package} variant={product.isActive ? 'success' : 'danger'} />
    </div>

    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        {hasPermission(user, 'products.view') && <TabsTrigger value="stock">Stock</TabsTrigger>}
        {hasPermission(user, 'products.update') && <TabsTrigger value="variants"><Layers className="h-4 w-4 mr-1.5" />Variants {variants.length > 0 && <Badge variant="secondary" className="ml-1.5">{variants.length}</Badge>}</TabsTrigger>}
        {hasPermission(user, 'products.update') && <TabsTrigger value="images"><ImageIcon className="h-4 w-4 mr-1.5" />Images {images.length > 0 && <Badge variant="secondary" className="ml-1.5">{images.length}</Badge>}</TabsTrigger>}
      </TabsList>

      {/* Details Tab */}
      <TabsContent value="details" className="space-y-6">
        <Card><CardHeader><CardTitle className="text-lg">Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Barcode</span><span className="font-medium">{product.barcode || '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unit</span><span className="font-medium">{product.unitOfMeasure}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax Rate</span><span className="font-medium">{product.taxRate}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Reorder Level</span><span className="font-medium">{product.reorderLevel}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Reorder Quantity</span><span className="font-medium">{product.reorderQuantity}</span></div>
          </CardContent>
        </Card>
        {product.description && (<Card><CardHeader><CardTitle className="text-lg">Description</CardTitle></CardHeader><CardContent><p className="text-sm">{product.description}</p></CardContent></Card>)}
      </TabsContent>

      {/* Stock Tab */}
      {hasPermission(user, 'products.view') && <TabsContent value="stock">
        <Card><CardHeader><CardTitle className="text-lg">Stock by Warehouse</CardTitle></CardHeader>
          <CardContent><div className="space-y-2">{product.warehouseStock?.length > 0 ? product.warehouseStock.map((ws: any) => (
            <div key={ws.id} className="flex justify-between text-sm border-b pb-1"><span>{ws.warehouse?.name || 'Unknown'}</span><span className="font-medium">{ws.quantity}</span></div>
          )) : <p className="text-sm text-muted-foreground">No stock data</p>}</div></CardContent>
        </Card>
      </TabsContent>}

      {/* Variants Tab */}
      {hasPermission(user, 'products.update') && <TabsContent value="variants" className="space-y-4">
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm"><thead><tr className="bg-muted/50"><th className="text-left p-2">SKU</th><th className="text-left p-2">Name</th><th className="text-right p-2">Cost</th><th className="text-right p-2">Selling</th><th className="text-left p-2">Barcode</th><th className="text-right p-2">Actions</th></tr></thead>
            <tbody>
              {variants.length === 0 ? <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No variants yet. Add size, color, or other variants of this product.</td></tr> : variants.map((v: any) => (
                editingVariant?.id === v.id ? (
                  <tr key={v.id} className="border-t bg-muted/20">
                    <td className="p-1"><Input className="h-8 text-sm" value={editingVariant.sku} onChange={(e) => setEditingVariant({ ...editingVariant, sku: e.target.value })} /></td>
                    <td className="p-1"><Input className="h-8 text-sm" value={editingVariant.name} onChange={(e) => setEditingVariant({ ...editingVariant, name: e.target.value })} /></td>
                    <td className="p-1"><Input type="number" className="h-8 text-sm w-24 text-right" value={editingVariant.costPrice} onChange={(e) => setEditingVariant({ ...editingVariant, costPrice: Number(e.target.value) })} /></td>
                    <td className="p-1"><Input type="number" className="h-8 text-sm w-24 text-right" value={editingVariant.sellingPrice} onChange={(e) => setEditingVariant({ ...editingVariant, sellingPrice: Number(e.target.value) })} /></td>
                    <td className="p-1"><Input className="h-8 text-sm" value={editingVariant.barcode || ''} onChange={(e) => setEditingVariant({ ...editingVariant, barcode: e.target.value })} /></td>
                    <td className="p-1 text-right"><div className="flex gap-1 justify-end"><Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600" onClick={handleEditVariant}>Save</Button><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingVariant(null)}>Cancel</Button></div></td>
                  </tr>
                ) : (
                  <tr key={v.id} className="border-t">
                    <td className="p-2 font-medium">{v.sku}</td><td className="p-2">{v.name}</td>
                    <td className="p-2 text-right text-muted-foreground">{formatPkr(v.costPrice)}</td>
                    <td className="p-2 text-right">{formatPkr(v.sellingPrice)}</td>
                    <td className="p-2 text-muted-foreground">{v.barcode || '-'}</td>
                    <td className="p-2 text-right"><div className="flex gap-1 justify-end"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingVariant({ ...v })}>Edit</Button><Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleDeleteVariant(v.id)}><Trash2 className="h-3 w-3" /></Button></div></td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Variant Inline Form */}
        <div className="border rounded p-3 bg-muted/20">
          <p className="text-sm font-medium mb-2">Add Variant</p>
          <div className="grid grid-cols-5 gap-2 items-end">
            <div className="space-y-1"><Label className="text-xs">SKU</Label><Input className="h-8 text-sm" placeholder="Required" value={newVariant?.sku || ''} onChange={(e) => setNewVariant({ ...newVariant, sku: e.target.value, ...(newVariant?.name ? {} : {}) })} /></div>
            <div className="space-y-1"><Label className="text-xs">Name</Label><Input className="h-8 text-sm" placeholder="e.g. Red / Large" value={newVariant?.name || ''} onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Cost</Label><Input type="number" className="h-8 text-sm" placeholder="0" value={newVariant?.costPrice ?? ''} onChange={(e) => setNewVariant({ ...newVariant, costPrice: Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label className="text-xs">Selling</Label><Input type="number" className="h-8 text-sm" placeholder="0" value={newVariant?.sellingPrice ?? ''} onChange={(e) => setNewVariant({ ...newVariant, sellingPrice: Number(e.target.value) })} /></div>
            <div className="flex gap-1"><Button size="sm" className="h-8 text-xs" onClick={handleAddVariant}>Add</Button><Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setNewVariant(null)}>Cancel</Button></div>
          </div>
          <div className="mt-2"><Label className="text-xs">Barcode (optional)</Label><Input className="h-8 text-sm" placeholder="Barcode" value={newVariant?.barcode || ''} onChange={(e) => setNewVariant({ ...newVariant, barcode: e.target.value })} /></div>
        </div>
      </TabsContent>}

      {/* Images Tab */}
      {hasPermission(user, 'products.update') && <TabsContent value="images" className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {images.map((img) => (
            <div key={img.id} className="relative group border rounded-lg overflow-hidden">
              <img src={img.imagePath} alt="Product" className="w-full h-40 object-cover" />
              {img.isPrimary && <span className="absolute top-2 left-2 bg-amber-400 text-amber-950 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><Star className="h-3 w-3" />Primary</span>}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                {!img.isPrimary && <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => handleSetPrimary(img.id)}><Star className="h-3 w-3 mr-1" />Set Primary</Button>}
                <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => handleDeleteImage(img.id)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
              </div>
            </div>
          ))}
          {images.length === 0 && (
            <div className="col-span-3 flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
              <ImageIcon className="h-12 w-12 mb-2 opacity-20" />
              <p className="text-sm">No images yet. Upload a product photo.</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={uploading || images.length >= 10} onClick={() => document.getElementById('image-upload')?.click()}>
            <Upload className="h-4 w-4 mr-2" />{uploading ? 'Uploading...' : 'Upload Image'}
          </Button>
          <span className="text-xs text-muted-foreground">{images.length}/10 images (JPG, PNG, WebP, max 5MB)</span>
          <input id="image-upload" type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleUploadImage} />
        </div>
      </TabsContent>}
    </Tabs>
  </div>);
}
