'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiGet, apiPost } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, ArrowRightLeft, Package } from 'lucide-react';

export default function TransfersPage() {
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ fromWarehouseId: '', toWarehouseId: '', transferDate: new Date().toISOString().slice(0, 10), reason: '', notes: '', transferItems: [] });
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const [tRes, wRes] = await Promise.all([apiGet('/inventory/transfers'), apiGet('/inventory/warehouses')]);
    if (tRes?.data) setItems(tRes.data);
    if (wRes?.data) setWarehouses(wRes.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (productSearch.length < 2) { setProductResults([]); return; }
    const t = setTimeout(async () => {
      const res = await apiGet(`/products/search?q=${productSearch}`).catch(() => null);
      if (res?.data) setProductResults(res.data);
    }, 200);
    return () => clearTimeout(t);
  }, [productSearch]);

  const openCreate = () => {
    setForm({ fromWarehouseId: '', toWarehouseId: '', transferDate: new Date().toISOString().slice(0, 10), reason: '', notes: '', transferItems: [] });
    setShowCreate(true);
  };

  const addTransferItem = (product: any, stock: number) => {
    if (form.transferItems.find((i: any) => i.productId === product.id)) { toast.error('Product already added'); return; }
    setForm({ ...form, transferItems: [...form.transferItems, { productId: product.id, productName: product.name, sku: product.sku, quantity: 1, availableStock: stock }] });
  };

  const removeTransferItem = (idx: number) => {
    const ti = [...form.transferItems]; ti.splice(idx, 1); setForm({ ...form, transferItems: ti });
  };

  const updateTransferItemQty = (idx: number, qty: number) => {
    const ti = [...form.transferItems]; ti[idx] = { ...ti[idx], quantity: Math.max(1, qty) }; setForm({ ...form, transferItems: ti });
  };

  const handleSubmit = async () => {
    if (!form.fromWarehouseId) { toast.error('Select source warehouse'); return; }
    if (!form.toWarehouseId) { toast.error('Select destination warehouse'); return; }
    if (form.fromWarehouseId === form.toWarehouseId) { toast.error('Source and destination must be different'); return; }
    if (form.transferItems.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      const res = await apiPost('/inventory/transfers', {
        fromWarehouseId: Number(form.fromWarehouseId),
        toWarehouseId: Number(form.toWarehouseId),
        transferDate: form.transferDate,
        reason: form.reason || null,
        notes: form.notes || null,
        items: form.transferItems.map((i: any) => ({ productId: Number(i.productId), quantity: i.quantity })),
      }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success(`Transfer ${res.data.transferNumber} completed. ${res.data.itemCount} items moved.`);
      setShowCreate(false); load();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const openDetail = async (id: string) => {
    const res = await apiGet(`/inventory/transfers/${id}`).catch(() => null);
    if (res?.data) setShowDetail(res.data);
  };

  const getStockForProduct = async (productId: number) => {
    if (!form.fromWarehouseId) return 0;
    const res = await apiGet(`/inventory/stock?warehouseId=${form.fromWarehouseId}&productId=${productId}`).catch(() => null);
    if (res?.data?.[0]) return res.data[0].quantity;
    return 0;
  };

  return (<div className="space-y-6">
    <PageHeader title="Stock Transfers" description="Transfer stock between warehouses">
      <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New Transfer</Button>
    </PageHeader>
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/50"><th className="text-left p-3">Transfer #</th><th className="text-left p-3">From</th><th className="text-left p-3">To</th><th className="text-left p-3">Date</th><th className="text-right p-3">Items</th><th className="text-left p-3">Reason</th><th className="text-right p-3">Actions</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={7} className="p-8 text-center">Loading...</td></tr> : items.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No transfers yet</td></tr> : items.map((t: any) => (<tr key={t.id} className="border-b cursor-pointer hover:bg-muted/30" onClick={() => openDetail(t.id)}>
        <td className="p-3 font-medium">{t.transferNumber}</td><td className="p-3">{t.fromWarehouseName}</td>
        <td className="p-3">{t.toWarehouseName}</td><td className="p-3">{new Date(t.transferDate).toLocaleDateString()}</td>
        <td className="p-3 text-right">{t.itemCount}</td><td className="p-3 text-muted-foreground">{t.reason || '-'}</td>
        <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(t.id); }}><ArrowRightLeft className="h-3.5 w-3.5" /></Button></td>
      </tr>))}</tbody></table></div></CardContent></Card>

    {/* Create Transfer Modal */}
    <Dialog open={showCreate} onOpenChange={setShowCreate}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>New Stock Transfer</DialogTitle>
        <DialogDescription>Move stock from one warehouse to another</DialogDescription></DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>From Warehouse</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.fromWarehouseId} onChange={(e) => setForm({ ...form, fromWarehouseId: e.target.value })}><option value="">Select source...</option>{warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            </div>
            <div className="space-y-1"><Label>To Warehouse</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.toWarehouseId} onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })}><option value="">Select destination...</option>{warehouses.filter((w: any) => w.id !== form.fromWarehouseId).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Transfer Date</Label><Input type="date" value={form.transferDate} onChange={(e) => setForm({ ...form, transferDate: e.target.value })} /></div>
            <div className="space-y-1"><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Branch restocking" /></div>
          </div>

          <div className="space-y-2">
            <Label>Add Items</Label>
            <div className="relative">
              <Input placeholder="Search products..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="h-9 text-sm" />
              {productResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border bg-popover shadow-xl max-h-48 overflow-y-auto">
                  {productResults.map((p: any) => (
                    <button key={p.id} className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center justify-between border-b last:border-0"
                      onMouseDown={async () => {
                        const stock = await getStockForProduct(p.id);
                        addTransferItem(p, stock);
                      }}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">Stock: {p.stock}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {form.transferItems.length > 0 && (
            <div className="space-y-2">
              <Label>Items to Transfer</Label>
              <div className="border rounded divide-y">
                {form.transferItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 p-2">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">Available: {item.availableStock}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input type="number" className="w-20 h-8 text-sm text-center" value={item.quantity}
                        onChange={(e) => updateTransferItemQty(idx, Number(e.target.value))}
                        max={item.availableStock} />
                    </div>
                    <button onClick={() => removeTransferItem(idx)} className="text-red-500 text-sm hover:text-red-700">Remove</button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{form.transferItems.length} item(s) to transfer</p>
            </div>
          )}

          <div className="space-y-1"><Label>Notes (optional)</Label>
            <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <Button className="w-full" disabled={saving || form.transferItems.length === 0} onClick={handleSubmit}>
            {saving ? 'Processing...' : <><ArrowRightLeft className="h-4 w-4 mr-2" />Transfer Stock</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Detail Modal */}
    <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{showDetail?.transferNumber}</DialogTitle></DialogHeader>
        {showDetail && (<div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">From:</span> <span className="font-medium">{showDetail.fromWarehouseName}</span></div>
            <div><span className="text-muted-foreground">To:</span> <span className="font-medium">{showDetail.toWarehouseName}</span></div>
            <div><span className="text-muted-foreground">Date:</span> <span>{new Date(showDetail.transferDate).toLocaleDateString()}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <span className="text-emerald-600 font-medium">{showDetail.status}</span></div>
            {showDetail.reason && <div className="col-span-2"><span className="text-muted-foreground">Reason:</span> <span>{showDetail.reason}</span></div>}
            {showDetail.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> <span>{showDetail.notes}</span></div>}
          </div>
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm"><thead><tr className="bg-muted/50"><th className="text-left p-2">Product</th><th className="text-left p-2">SKU</th><th className="text-right p-2">Qty</th></tr></thead>
              <tbody>{showDetail.items.map((i: any) => (<tr key={i.id} className="border-t">
                <td className="p-2">{i.productName}</td><td className="p-2 text-muted-foreground">{i.productSku}</td><td className="p-2 text-right">{i.quantity}</td>
              </tr>))}</tbody>
            </table>
          </div>
        </div>)}
      </DialogContent>
    </Dialog>
  </div>);
}
