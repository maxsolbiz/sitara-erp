'use client'; import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; import { apiGet, apiPost } from '@/lib/api';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner'; import { formatPkr } from '@/lib/utils';
import { ArrowLeft, Save, Plus, Minus } from 'lucide-react';

export default function CreateReceiptPage() {
  const router = useRouter();
  const [pos, setPos] = useState<any[]>([]);
  const [selectedPo, setSelectedPo] = useState<any>(null);
  const [poItems, setPoItems] = useState<any[]>([]);
  const [receiptItems, setReceiptItems] = useState<Record<number, { qty: number; cost: number; wh: string }>>({});
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { apiGet('/purchases/orders').then((r: any) => { if (r?.data) setPos(r.data.filter((o: any) => o.status !== 'RECEIVED' && o.status !== 'CANCELLED')); }).catch(() => {}); }, []);

  const loadPo = async (poId: string) => {
    const res = await apiGet(`/purchases/orders/${poId}`).catch(() => null);
    if (res?.data) {
      setSelectedPo(res.data);
      const items = res.data.items || [];
      setPoItems(items);
      const init: Record<number, { qty: number; cost: number; wh: string }> = {};
      for (const i of items) {
        const remaining = i.quantityOrdered - (i.quantityReceived || 0);
        init[i.id] = { qty: remaining > 0 ? remaining : 0, cost: Number(i.unitCost), wh: '1' };
      }
      setReceiptItems(init);
    }
  };

  const handleSave = async () => {
    const items = poItems.filter((i) => (receiptItems[i.id]?.qty || 0) > 0).map((i) => ({ purchaseOrderItemId: i.id, productId: Number(i.productId), quantityReceived: receiptItems[i.id].qty, unitCost: receiptItems[i.id].cost, warehouseId: Number(receiptItems[i.id].wh) }));
    if (items.length === 0) { toast.error('Receive at least one item'); return; }
    setSaving(true);
    try {
      const res = await apiPost('/purchases/receipts', { purchaseOrderId: selectedPo.id, referenceNumber: reference, items }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Receipt created');
      router.push('/purchases/receipts');
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Create Receipt" description="Receive stock against a purchase order">
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
    </PageHeader>
    <Card><CardContent className="pt-6 space-y-4">
      <div className="space-y-2"><Label>Purchase Order *</Label>
        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" onChange={(e) => e.target.value && loadPo(e.target.value)} defaultValue="">
          <option value="" disabled>Select PO...</option>
          {pos.map((po: any) => <option key={po.id} value={po.id}>{po.orderNumber} — {po.vendorName} ({po.status})</option>)}
        </select>
      </div>
      {selectedPo && (<>
        <div className="text-sm"><span className="text-muted-foreground">Vendor:</span> <span className="font-medium">{selectedPo.vendor?.companyName}</span></div>
        {poItems.map((i: any) => {
          const remaining = i.quantityOrdered - (i.quantityReceived || 0);
          return (<div key={i.id} className="flex items-end gap-3 border rounded-lg p-3">
            <div className="flex-1"><Label className="text-xs">{i.product?.name} ({remaining} remaining)</Label>
              <div className="flex gap-2 mt-1">
                <div><Input type="number" placeholder="Qty" value={receiptItems[i.id]?.qty || ''} onChange={(e) => setReceiptItems({ ...receiptItems, [i.id]: { ...receiptItems[i.id], qty: Math.min(Number(e.target.value) || 0, remaining) } })} className="h-8 w-20 text-sm" /></div>
                <div><Input type="number" placeholder="Cost" value={receiptItems[i.id]?.cost || ''} onChange={(e) => setReceiptItems({ ...receiptItems, [i.id]: { ...receiptItems[i.id], cost: Number(e.target.value) || 0 } })} className="h-8 w-24 text-sm" /></div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground pb-1">{formatPkr((receiptItems[i.id]?.qty || 0) * (receiptItems[i.id]?.cost || 0))}</div>
          </div>);
        })}
        <Button className="w-full" onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? 'Creating...' : 'Create Receipt'}</Button>
      </>)}
    </CardContent></Card>
  </div>);
}
