'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Printer, Truck } from 'lucide-react';

export default function PurchaseOrderDetailPage() {
  const params = useParams(); const router = useRouter();
  const [order, setOrder] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiGet(`/purchases/orders/${params.id}`).then((r: any) => { if (r?.data) setOrder(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, [params.id]);
  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!order) return <div className="text-center py-12 text-muted-foreground">Order not found</div>;
  return (<div className="space-y-6">
    <PageHeader title={`PO #${order.orderNumber}`} description={`Vendor: ${order.vendor?.companyName || 'N/A'}`}>
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
      <Button variant="outline" size="sm" onClick={() => window.open(`/purchases/orders/${params.id}/print-order`, '_blank')}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
      <Button size="sm"><Truck className="h-4 w-4 mr-1.5" />Receive Goods</Button>
    </PageHeader>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-lg">Order Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Vendor</span><span className="font-medium">{order.vendor?.companyName || 'N/A'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Order Date</span><span className="font-medium">{new Date(order.orderDate).toLocaleDateString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Expected Date</span><span className="font-medium">{order.expectedDate ? new Date(order.expectedDate).toLocaleDateString() : '-'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={order.status === 'RECEIVED' ? 'default' : order.status === 'CANCELLED' ? 'destructive' : order.status === 'DRAFT' ? 'outline' : 'secondary'}>{order.status}</Badge></div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-lg">Vendor Details</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p><span className="text-muted-foreground">Contact:</span> {order.vendor?.contactPerson || '-'}</p>
          <p><span className="text-muted-foreground">Phone:</span> {order.vendor?.phone || '-'}</p>
          <p><span className="text-muted-foreground">Email:</span> {order.vendor?.email || '-'}</p>
        </CardContent>
      </Card>
    </div>
    <Card><CardHeader><CardTitle className="text-lg">Items</CardTitle></CardHeader>
      <CardContent>
        <Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Ordered</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Unit Cost</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>{order.items?.map((i: any) => (<TableRow key={i.id}>
            <TableCell className="font-medium">{i.product?.name || `Product #${i.productId}`}</TableCell>
            <TableCell className="text-right">{i.quantityOrdered}</TableCell>
            <TableCell className="text-right">{i.quantityReceived || 0}</TableCell>
            <TableCell className="text-right">{formatPkr(Number(i.unitCost))}</TableCell>
            <TableCell className="text-right font-medium">{formatPkr(Number(i.unitCost) * i.quantityOrdered)}</TableCell>
          </TableRow>))}</TableBody>
        </Table>
        <div className="flex justify-end mt-4 pt-4 border-t">
          <div className="text-right"><p className="text-sm text-muted-foreground">Subtotal: {formatPkr(Number(order.subtotal))}</p><p className="text-lg font-bold">Total: {formatPkr(Number(order.totalAmount))}</p></div>
        </div>
      </CardContent>
    </Card>
    {order.notes && (<Card><CardHeader><CardTitle className="text-lg">Notes</CardTitle></CardHeader><CardContent><p className="text-sm">{order.notes}</p></CardContent></Card>)}
  </div>);
}
