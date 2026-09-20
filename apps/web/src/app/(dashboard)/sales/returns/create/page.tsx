'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGet, apiPost } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { toast } from 'sonner';
import { ArrowLeft, Save, Search } from 'lucide-react';

export default function CreateSalesReturnPage() {
  const router = useRouter(); const searchParams = useSearchParams();
  const [saleId, setSaleId] = useState(searchParams.get('saleId') || '');
  const [sale, setSale] = useState<any>(null);
  const [reason, setReason] = useState('Defective');
  const [items, setItems] = useState<{ saleItemId: number; productName: string; qtyReturned: number; maxQty: number; unitPrice: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const loadSale = async () => {
    if (!saleId) return;
    const res = await apiGet(`/sales/${saleId}`).catch(() => null);
    if (res?.data) {
      setSale(res.data);
      setItems(res.data.items.map((i: any) => ({ saleItemId: i.id, productName: i.product?.name || `Item`, qtyReturned: 0, maxQty: i.quantity, unitPrice: Number(i.unitPrice) })));
    } else toast.error('Sale not found');
  };

  useEffect(() => {
    if (saleId) loadSale();
  }, [saleId]);

  const total = items.reduce((s, i) => s + (i.qtyReturned * i.unitPrice), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selected = items.filter((i) => i.qtyReturned > 0);
    if (selected.length === 0) { toast.error('Select items to return'); return; }
    setSaving(true);
    try {
      const res = await apiPost('/sales-returns', { saleId: Number(saleId), items: selected.map((i) => ({ saleItemId: i.saleItemId, quantity: i.qtyReturned })), reason }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Return submitted for approval'); router.push('/sales/returns');
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Create Sales Return" description="Process a customer return">
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
    </PageHeader>
    <Card><CardHeader><CardTitle className="text-lg">Find Sale</CardTitle></CardHeader>
      <CardContent className="flex items-end gap-2">
        <div className="flex-1 space-y-1"><Label>Sale ID</Label><Input value={saleId} onChange={(e) => setSaleId(e.target.value)} placeholder="Enter sale number or ID" /></div>
        <Button onClick={loadSale}><Search className="h-4 w-4 mr-1" />Load</Button>
      </CardContent>
    </Card>
    {sale && (<form onSubmit={handleSubmit}>
      <Card className="mb-6"><CardHeader><CardTitle className="text-lg">Sale #{sale.saleNumber}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm mb-4">Customer: {sale.customer?.fullName || 'Walk-in'} | Date: {new Date(sale.saleDate).toLocaleDateString()} | Total: {formatPkr(Number(sale.totalAmount))}</p>
          <div className="space-y-2">
            {items.map((item, i) => (<div key={i} className="flex items-center gap-4 border-b pb-2">
              <div className="flex-1"><p className="text-sm font-medium">{item.productName}</p><p className="text-xs text-muted-foreground">Max: {item.maxQty} × {formatPkr(item.unitPrice)}</p></div>
              <Input type="number" className="w-20 h-9" min={0} max={item.maxQty} value={item.qtyReturned || ''} onChange={(e) => { const nl = [...items]; nl[i].qtyReturned = Math.min(Number(e.target.value), item.maxQty); setItems(nl); }} />
            </div>))}
          </div>
          <div className="mt-4 space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Defective', 'Wrong Item', 'Not Satisfied', 'Customer Return', 'Changed Mind', 'Other'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold">Return Total: {formatPkr(total)}</p>
        <Button type="submit" disabled={saving || total === 0}><Save className="h-4 w-4 mr-2" />{saving ? 'Submitting...' : 'Submit Return'}</Button>
      </div>
    </form>)}
  </div>);
}
