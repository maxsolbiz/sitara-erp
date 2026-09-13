'use client'; import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; import { apiGet } from '@/lib/api';
import { PageHeader } from '@/components/page-header'; import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; import { Badge } from '@/components/ui/badge'; import { formatPkr } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

export default function ReturnDetailPage() {
  const params = useParams(); const router = useRouter();
  const [ret, setRet] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet(`/sales-returns/${params.id}`).then((r: any) => { if (r?.data) setRet(r.data); setLoading(false); }).catch(() => setLoading(false)); }, [params.id]);
  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!ret) return <div className="text-center py-12 text-muted-foreground">Return not found</div>;
  return (<div className="space-y-6">
    <PageHeader title={ret.returnNumber} description={`Sale: ${ret.saleNumber}`}><Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button></PageHeader>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Status</CardTitle></CardHeader><CardContent><Badge variant={ret.status === 'APPROVED' ? 'default' : ret.status === 'REJECTED' ? 'destructive' : 'secondary'}>{ret.status}</Badge></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Customer</CardTitle></CardHeader><CardContent><p className="font-medium">{ret.customerName}</p><p className="text-xs text-muted-foreground">{ret.customerPhone}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(ret.totalAmount)}</p></CardContent></Card>
    </div>
    {ret.rejectionReason && <Card className="border-red-300"><CardHeader><CardTitle className="text-sm text-red-700">Rejected</CardTitle></CardHeader><CardContent><p className="text-sm">{ret.rejectionReason}</p></CardContent></Card>}
    <Card><CardHeader><CardTitle className="text-lg">Items</CardTitle></CardHeader>
      <CardContent><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left p-2">Product</th><th className="text-right p-2">Qty</th><th className="text-right p-2">Price</th><th className="text-right p-2">Total</th></tr></thead>
        <tbody>{ret.items?.map((i: any) => (<tr key={i.id} className="border-b"><td className="p-2">{i.productName}</td><td className="p-2 text-right">{i.quantityReturned}</td><td className="p-2 text-right">{formatPkr(i.unitPrice)}</td><td className="p-2 text-right">{formatPkr(i.lineTotal)}</td></tr>))}</tbody></table></CardContent>
    </Card>
  </div>);
}
