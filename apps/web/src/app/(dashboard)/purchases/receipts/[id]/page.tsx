'use client'; import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; import { apiGet } from '@/lib/api';
import { PageHeader } from '@/components/page-header'; import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; import { formatPkr } from '@/lib/utils';
import { ArrowLeft, Printer } from 'lucide-react';

export default function ReceiptDetailPage() {
  const params = useParams(); const router = useRouter();
  const [receipt, setReceipt] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet(`/purchases/receipts/${params.id}`).then((r: any) => { if (r?.data) setReceipt(r.data); setLoading(false); }).catch(() => setLoading(false)); }, [params.id]);
  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!receipt) return <div className="text-center py-12 text-muted-foreground">Receipt not found</div>;
  return (<div className="space-y-6">
    <PageHeader title={receipt.receiptNumber} description={`PO: ${receipt.purchaseOrder?.orderNumber}`}>
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
    </PageHeader>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardHeader><CardTitle className="text-sm">Vendor</CardTitle></CardHeader><CardContent><p className="font-medium">{receipt.purchaseOrder?.vendor?.companyName}</p><p className="text-xs text-muted-foreground">{receipt.purchaseOrder?.vendor?.phone}</p></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Date</CardTitle></CardHeader><CardContent><p className="font-medium">{new Date(receipt.receiptDate).toLocaleDateString()}</p></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Items</CardTitle></CardHeader><CardContent><p className="font-medium">{receipt.totalItems} items</p></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-lg">Received Items</CardTitle></CardHeader>
      <CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left p-2">Product</th><th className="text-right p-2">Qty</th><th className="text-right p-2">Unit Cost</th><th className="text-right p-2">Subtotal</th></tr></thead>
        <tbody>{receipt.items?.map((i: any) => (<tr key={i.id} className="border-b"><td className="p-2 font-medium">{i.product?.name}</td><td className="p-2 text-right">{i.quantityReceived}</td><td className="p-2 text-right">{formatPkr(Number(i.unitCost))}</td><td className="p-2 text-right">{formatPkr(Number(i.unitCost) * i.quantityReceived)}</td></tr>))}</tbody>
        <tfoot><tr className="font-bold"><td colSpan={3} className="p-2 text-right">Total</td><td className="p-2 text-right">{formatPkr(receipt.items?.reduce((s: number, i: any) => s + Number(i.unitCost) * i.quantityReceived, 0) || 0)}</td></tr></tfoot>
      </table></div></CardContent>
    </Card>
  </div>);
}
