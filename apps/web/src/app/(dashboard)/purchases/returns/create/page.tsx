'use client'; import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; import { apiGet, apiPost } from '@/lib/api';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card'; import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';

export default function CreatePurchaseReturnPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [receiptItems, setReceiptItems] = useState<any[]>([]);
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('defective');
  const [saving, setSaving] = useState(false);

  useEffect(() => { apiGet('/vendors').then((r: any) => { if (r?.data) setVendors(r.data); }).catch(() => {}); }, []);

  const loadReceipts = async (vendorId: string) => {
    setSelectedVendor(vendorId);
    const res = await apiGet('/purchases/receipts').catch(() => null);
    if (res?.data) setReceipts(res.data.filter((r: any) => r.vendorId === vendorId || true));
  };

  const loadReceipt = async (receiptId: string) => {
    const res = await apiGet(`/purchases/receipts/${receiptId}`).catch(() => null);
    if (res?.data) {
      setSelectedReceipt(res.data);
      const items = res.data.items || [];
      setReceiptItems(items);
      const init: Record<string, number> = {};
      for (const i of items) init[i.id] = 0;
      setReturnItems(init);
    }
  };

  const handleSave = async () => {
    const items = receiptItems.filter((i) => (returnItems[i.id] || 0) > 0).map((i) => ({ productId: Number(i.productId), quantityReturned: returnItems[i.id], unitCost: Number(i.unitCost), warehouseId: 1 }));
    if (items.length === 0) { toast.error('Select items to return'); return; }
    setSaving(true);
    try {
      const res = await apiPost('/purchases/returns', { vendorId: selectedVendor, reason, items }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Return submitted for approval');
      router.push('/purchases/returns');
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Create Purchase Return" description="Return items to vendor">
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
    </PageHeader>
    <Card><CardContent className="pt-6 space-y-4">
      <div className="space-y-2"><Label>Vendor *</Label>
        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" onChange={(e) => loadReceipts(e.target.value)} defaultValue=""><option value="" disabled>Select vendor...</option>{vendors.map((v: any) => <option key={v.id} value={v.id}>{v.companyName}</option>)}</select>
      </div>
      {selectedVendor && <div className="space-y-2"><Label>Receipt *</Label>
        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" onChange={(e) => e.target.value && loadReceipt(e.target.value)} defaultValue=""><option value="" disabled>Select receipt...</option>{receipts.map((r: any) => <option key={r.id} value={r.id}>{r.receiptNumber}</option>)}</select>
      </div>}
      {selectedReceipt && (<>
        {receiptItems.map((i: any) => (<div key={i.id} className="flex items-center gap-3 border rounded-lg p-3">
          <div className="flex-1"><p className="text-sm font-medium">{i.product?.name}</p><p className="text-xs text-muted-foreground">Qty received: {i.quantityReceived}</p></div>
          <Input type="number" placeholder="Return qty" value={returnItems[i.id] || ''} onChange={(e) => setReturnItems({ ...returnItems, [i.id]: Math.min(Number(e.target.value) || 0, i.quantityReceived) })} className="h-8 w-20 text-sm" />
        </div>))}
        <div className="space-y-2"><Label>Reason</Label>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="defective">Defective</option><option value="wrong_item">Wrong Item</option><option value="excess_quantity">Excess Quantity</option><option value="quality_issue">Quality Issue</option><option value="other">Other</option>
          </select>
        </div>
        <Button className="w-full" onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? 'Creating...' : 'Create Return'}</Button>
      </>)}
    </CardContent></Card>
  </div>);
}
