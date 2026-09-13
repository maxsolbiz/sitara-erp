'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { apiGet } from '@/lib/api';
import { formatPkr, formatDateTime } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { Breadcrumb } from '@/components/breadcrumb';
import { ArrowLeft, ShoppingBag, DollarSign, CreditCard, FileText, Printer } from 'lucide-react';
import { DetailPageSkeleton } from '@/components/skeletons';

export default function SaleDetailPage() {
  const params = useParams(); const router = useRouter();
  const [sale, setSale] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiGet(`/sales/${params.id}`).then((r: any) => { if (r?.data) setSale(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, [params.id]);
  if (loading) return <DetailPageSkeleton />;
  if (!sale) return <div className="text-center py-12 text-muted-foreground">Sale not found</div>;
  return (<div className="space-y-6">
    <Breadcrumb dynamicLabels={{ [params.id as string]: `#${sale?.saleNumber}` }} />
    <PageHeader title={`Sale #${sale.saleNumber}`} description={`Date: ${formatDateTime(sale.saleDate)}`}>
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
      <Button variant="outline" size="sm" onClick={() => window.open(`/sales/${params.id}/print-invoice`, '_blank')}><Printer className="h-4 w-4 mr-1.5" />Print Invoice</Button>
      <Button variant="outline" size="sm" asChild><Link href={`/receipt/${params.id}`} target="_blank"><Printer className="h-4 w-4 mr-1.5" />Print Receipt</Link></Button>
    </PageHeader>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Total" value={formatPkr(Number(sale.totalAmount))} icon={DollarSign} variant="primary" />
      <StatCard title="Paid" value={formatPkr(Number(sale.paidAmount))} icon={ShoppingBag} variant="success" />
      <StatCard title="Status" value={sale.status} icon={FileText} variant={sale.status === 'COMPLETED' ? 'success' : sale.status === 'CANCELLED' ? 'danger' : 'warning'} />
      <StatCard title="Payment" value={sale.paymentStatus} icon={CreditCard} variant={sale.paymentStatus === 'PAID' ? 'success' : 'warning'} />
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-lg">Sale Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{sale.customer?.fullName || 'Walk-in'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPkr(Number(sale.subtotal))}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>{formatPkr(Number(sale.discountAmount))}</span></div>
          <Separator />
          <div className="flex justify-between font-bold"><span>Total</span><span>{formatPkr(Number(sale.totalAmount))}</span></div>
          {sale.notes && <div className="pt-2"><span className="text-muted-foreground">Notes:</span><p className="mt-1">{sale.notes}</p></div>}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-lg">Payments</CardTitle></CardHeader>
        <CardContent>{sale.payments?.length > 0 ? (
          <Table><TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader>
            <TableBody>{sale.payments.map((p: any) => (<TableRow key={p.id}><TableCell><Badge variant="outline">{p.paymentMethod}</Badge></TableCell><TableCell className="text-right font-medium">{formatPkr(Number(p.amount))}</TableCell><TableCell className="text-xs">{p.referenceNumber || '-'}</TableCell></TableRow>))}</TableBody></Table>
        ) : <p className="text-sm text-muted-foreground">No payment records</p>}</CardContent>
      </Card>
    </div>
    <Card><CardHeader><CardTitle className="text-lg">Items</CardTitle></CardHeader>
      <CardContent>
        <Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Discount</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>{sale.items?.map((i: any) => (<TableRow key={i.id}>
            <TableCell className="font-medium">{i.product?.name || `Product #${i.productId}`}</TableCell>
            <TableCell className="text-right">{i.quantity}</TableCell>
            <TableCell className="text-right">{formatPkr(Number(i.unitPrice))}</TableCell>
            <TableCell className="text-right">{formatPkr(Number(i.discountAmount))}</TableCell>
            <TableCell className="text-right font-medium">{formatPkr(Number(i.lineTotal))}</TableCell>
          </TableRow>))}</TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>);
}
