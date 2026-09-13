'use client'; import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; import Link from 'next/link';
import { PageHeader } from '@/components/page-header'; import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge'; import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiGet, apiPost, apiDelete } from '@/lib/api'; import { formatPkr, formatDateTime } from '@/lib/utils';
import { DataTable } from '@/components/data-table'; import { format } from 'date-fns';
import { ColumnDef } from '@tanstack/react-table'; import { toast } from 'sonner';
import { Breadcrumb } from '@/components/breadcrumb';
import { ArrowLeft, CreditCard, Pencil, Printer, Trash2 } from 'lucide-react';
import { useAuth, hasPermission } from '@/lib/auth';
import { DetailPageSkeleton } from '@/components/skeletons';

const poCols: ColumnDef<any>[] = [
  { accessorKey: 'orderNumber', header: 'PO #' },
  { accessorKey: 'orderDate', header: 'Date', cell: ({ row }) => row.original.orderDate ? format(new Date(row.original.orderDate), 'MMM d, yyyy') : '-' },
  { accessorKey: 'totalAmount', header: 'Amount', cell: ({ row }) => formatPkr(row.original.totalAmount) },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={row.original.status === 'RECEIVED' ? 'default' : row.original.status === 'CANCELLED' ? 'destructive' : 'secondary'}>{row.original.status}</Badge> },
];

const typeColors: Record<string, string> = { PURCHASE: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300', PAYMENT: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300', RETURN: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' };

export default function VendorDetailPage() {
  const params = useParams(); const router = useRouter();
  const [vendor, setVendor] = useState<any>(null); const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]); const [ledgerMeta, setLedgerMeta] = useState<any>({});
  const [activity, setActivity] = useState<any[]>([]); const [activityPage, setActivityPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({ amount: 0, paymentMethod: 'CASH', paymentDate: '', referenceNumber: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const { user } = useAuth();

  const load = async (lp?: number) => {
    const p = lp || ledgerPage;
    const [v, pos, l, act] = await Promise.all([
      apiGet(`/vendors/${params.id}`).catch(() => null),
      apiGet('/purchases/orders').catch(() => null),
      apiGet(`/vendors/${params.id}/ledger?page=${p}&perPage=20`).catch(() => null),
      apiGet(`/vendors/${params.id}/activity?page=${activityPage}&perPage=20`).catch(() => null),
    ]);
    if (v?.data) setVendor(v.data);
    if (pos?.data) setPurchaseOrders(pos.data.filter((po: any) => po.vendorId == params.id));
    if (l?.data) { setLedger(l.data); setLedgerMeta(l.meta || {}); }
    if (act?.data) setActivity(act.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [params.id]);

  const handlePayment = async () => {
    if (payForm.amount <= 0) { toast.error('Amount must be positive'); return; }
    setSaving(true);
    try {
      const res = await apiPost(`/vendors/${params.id}/payments`, payForm) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Payment recorded'); setShowPayment(false);
      setPayForm({ amount: 0, paymentMethod: 'CASH', paymentDate: '', referenceNumber: '', notes: '' });
      load();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };
  const handleDelete = async () => {
    if (!confirm('Delete this vendor?')) return;
    try {
      const res = await apiDelete(`/vendors/${params.id}`) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Vendor deleted');
      router.push('/vendors');
    } catch (err: any) { toast.error(err.message); }
  };

  const ledgerCols: ColumnDef<any>[] = [
    { accessorKey: 'createdAt', header: 'Date', cell: ({ row }) => format(new Date(row.original.createdAt), 'MMM d, yyyy') },
    { accessorKey: 'type', header: 'Type', cell: ({ row }) => <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[row.original.type] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{row.original.type}</span> },
    { accessorKey: 'notes', header: 'Description' },
    { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => formatPkr(row.original.amount) },
    { accessorKey: 'balanceBefore', header: 'Before', cell: ({ row }) => formatPkr(row.original.balanceBefore) },
    { accessorKey: 'balanceAfter', header: 'After', cell: ({ row }) => <span className={`font-medium ${row.original.balanceAfter > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatPkr(row.original.balanceAfter)}</span> },
  ];

  if (loading) return <DetailPageSkeleton />;
  if (!vendor) return <div className="text-center py-12 text-muted-foreground">Vendor not found</div>;

  return (<div className="space-y-6">
    <Breadcrumb dynamicLabels={{ [params.id as string]: vendor?.companyName }} />
    <PageHeader title={vendor.companyName} description={`Code: ${vendor.code}`}>
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
      <Button variant="outline" size="sm" onClick={() => window.open(`/vendors/${params.id}/print-ledger`, '_blank')}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
      {hasPermission(user, 'vendors.update') && <Button variant="outline" size="sm" asChild><Link href={`/vendors/${params.id}/edit`}><Pencil className="h-4 w-4 mr-1.5" />Edit</Link></Button>}
      {hasPermission(user, 'vendors.delete') && <Button variant="outline" size="sm" onClick={handleDelete}><Trash2 className="h-4 w-4 mr-1.5" />Delete</Button>}
    </PageHeader>

    <Tabs defaultValue="overview">
      <TabsList>
        {hasPermission(user, 'vendors.view') && <TabsTrigger value="overview">Overview</TabsTrigger>}
        {hasPermission(user, 'vendors.view') && <TabsTrigger value="ledger">Ledger</TabsTrigger>}
        {hasPermission(user, 'vendors.view') && <TabsTrigger value="statement">Statement</TabsTrigger>}
        {hasPermission(user, 'vendors.view') && <TabsTrigger value="activity">Activity</TabsTrigger>}
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        <Card><CardHeader><CardTitle className="text-lg">Contact Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Contact Person:</span> <span className="font-medium">{vendor.contactPerson || '-'}</span></div>
            <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{vendor.phone || '-'}</span></div>
            <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{vendor.email || '-'}</span></div>
            <div><span className="text-muted-foreground">Balance:</span> <span className={`font-medium ${vendor.currentBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatPkr(vendor.currentBalance)}</span></div>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-lg">Purchase Orders</CardTitle></CardHeader>
          <CardContent><DataTable columns={poCols} data={purchaseOrders} loading={false} /></CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="ledger" className="space-y-4">
        <div className="flex items-center justify-between">
          <div><span className="text-sm text-muted-foreground">Current Balance: </span><span className={`text-lg font-bold ${vendor.currentBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatPkr(vendor.currentBalance)}</span></div>
          {hasPermission(user, 'vendors.payments') && <Button size="sm" onClick={() => setShowPayment(true)}><CreditCard className="h-4 w-4 mr-1.5" />Add Payment</Button>}
        </div>
        <DataTable columns={ledgerCols} data={ledger} loading={false} />
        {ledgerMeta?.totalPages > 1 && <div className="flex justify-between text-xs"><Button variant="outline" size="sm" disabled={ledgerPage <= 1} onClick={() => { setLedgerPage(ledgerPage - 1); load(ledgerPage - 1); }}>Previous</Button><span className="self-center text-muted-foreground">Page {ledgerPage} of {ledgerMeta.totalPages}</span><Button variant="outline" size="sm" disabled={ledgerPage >= ledgerMeta.totalPages} onClick={() => { setLedgerPage(ledgerPage + 1); load(ledgerPage + 1); }}>Next</Button></div>}
      </TabsContent>

      <TabsContent value="statement">
        <div className="text-center py-8 text-muted-foreground text-sm">
          Statement page — click Print for a print-friendly view.<br />
          <Button variant="outline" size="sm" className="mt-2" onClick={() => window.print()}>Print Statement</Button>
        </div>
      </TabsContent>
      <TabsContent value="activity">
        <DataTable columns={[
          { accessorKey: 'createdAt', header: 'Date', cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString() },
          { accessorKey: 'action', header: 'Action', cell: ({ row }) => <Badge variant="secondary">{row.original.action}</Badge> },
          { accessorKey: 'description', header: 'Description' },
        ]} data={activity} loading={loading} />
      </TabsContent>
    </Tabs>

    <Dialog open={showPayment} onOpenChange={setShowPayment}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-center py-2"><p className="text-sm text-muted-foreground">Current Balance</p><p className="text-2xl font-bold">{formatPkr(vendor.currentBalance)}</p></div>
          <div className="space-y-1"><Label>Amount *</Label><Input type="number" value={payForm.amount || ''} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>Payment Method</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={payForm.paymentMethod} onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}>
              <option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label>Date</Label><Input type="date" value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} /></div><div className="space-y-1"><Label>Reference</Label><Input value={payForm.referenceNumber} onChange={(e) => setPayForm({ ...payForm, referenceNumber: e.target.value })} /></div></div>
          <div className="space-y-1"><Label>Notes</Label><textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
          <Button className="w-full" onClick={handlePayment} disabled={saving}>{saving ? 'Recording...' : 'Record Payment'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
