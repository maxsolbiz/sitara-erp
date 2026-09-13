'use client'; import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; import Link from 'next/link';
import { PageHeader } from '@/components/page-header'; import { StatCard } from '@/components/stat-card'; import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge'; import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/data-table';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { useAuth, hasPermission } from '@/lib/auth';
import { ColumnDef } from '@tanstack/react-table'; import { toast } from 'sonner';
import { DetailPageSkeleton } from '@/components/skeletons';
import { Breadcrumb } from '@/components/breadcrumb';
import { ArrowLeft, CreditCard, DollarSign, Users, Pencil, ShoppingBag, Banknote, RotateCcw, AlertTriangle, Printer } from 'lucide-react';
import { format } from 'date-fns';

const typeColors: Record<string, string> = { SALE: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300', PAYMENT: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300', REFUND: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300', ADJUSTMENT: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300', VOID: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300', MIGRATION: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300' };

function isDebit(type: string) { return ['SALE', 'ADJUSTMENT', 'VOID', 'MIGRATION'].includes(type); }
function isCredit(type: string) { return ['PAYMENT', 'REFUND'].includes(type); }

export default function CustomerDetailPage() {
  const params = useParams(); const router = useRouter();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]); const [ledgerMeta, setLedgerMeta] = useState<any>({});
  const [showPayment, setShowPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: 0, paymentMethod: 'CASH', referenceNumber: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [activity, setActivity] = useState<any[]>([]);
  const [ledgerFilter, setLedgerFilter] = useState({ startDate: '', endDate: '', type: '' });
  const [activeTab, setActiveTab] = useState('overview');

  const loadLedger = async (lp?: number, filter?: any) => {
    const p = lp || ledgerPage;
    const f = filter || ledgerFilter;
    let url = `/customers/${params.id}/ledger?page=${p}&perPage=20`;
    if (f.startDate) url += `&startDate=${f.startDate}`;
    if (f.endDate) url += `&endDate=${f.endDate}`;
    if (f.type) url += `&type=${f.type}`;
    const l = await apiGet(url).catch(() => null);
    if (l?.data) { setLedger(l.data); setLedgerMeta(l.meta || {}); }
  };

  const load = async (lp?: number) => {
    const [v, act, stats] = await Promise.all([
      apiGet(`/customers/${params.id}`).catch(() => null),
      apiGet(`/customers/${params.id}/activity`).catch(() => null),
      apiGet(`/customers/${params.id}/stats`).catch(() => null),
    ]);
    if (v?.data) setCustomer(v.data);
    if (act?.data) setActivity(act.data);
    if (stats?.data) setDashboardStats(stats.data);
    await loadLedger(lp);
    setLoading(false);
  };

  useEffect(() => { load(); }, [params.id]);

  const handleAddPayment = async () => {
    if (paymentForm.amount <= 0) { toast.error('Amount must be positive'); return; }
    setSaving(true);
    try {
      const res = await apiPost(`/customers/${params.id}/payments`, paymentForm) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success(`Payment of ${formatPkr(paymentForm.amount)} recorded`);
      setShowPayment(false);
      setPaymentForm({ amount: 0, paymentMethod: 'CASH', referenceNumber: '', notes: '' });
      load();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const applyLedgerFilter = () => { setLedgerPage(1); loadLedger(1, ledgerFilter); };
  const clearLedgerFilter = () => { setLedgerFilter({ startDate: '', endDate: '', type: '' }); setLedgerPage(1); loadLedger(1, { startDate: '', endDate: '', type: '' }); };

  const ledgerCols: ColumnDef<any>[] = [
    { accessorKey: 'createdAt', header: 'Date', cell: ({ row }) => <div><div>{format(new Date(row.original.createdAt), 'MMM d, yyyy')}</div><div className="text-xs text-muted-foreground">{format(new Date(row.original.createdAt), 'HH:mm')}</div></div> },
    { accessorKey: 'referenceNumber', header: 'Reference', cell: ({ row }) => row.original.referenceNumber || '-' },
    { accessorKey: 'type', header: 'Type', cell: ({ row }) => <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[row.original.type] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{row.original.type}</span> },
    { id: 'debit', header: 'Debit', cell: ({ row }) => isDebit(row.original.type) ? <span className="text-red-600">{formatPkr(row.original.amount)}</span> : '-' },
    { id: 'credit', header: 'Credit', cell: ({ row }) => isCredit(row.original.type) ? <span className="text-emerald-600">{formatPkr(row.original.amount)}</span> : '-' },
    { accessorKey: 'balanceAfter', header: 'Balance', cell: ({ row }) => <span className={`font-semibold ${row.original.balanceAfter > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatPkr(row.original.balanceAfter)}</span> },
    { id: 'receipt', header: '', cell: ({ row }) => row.original.type === 'PAYMENT' ? (
      <Button variant="ghost" size="sm"
        onClick={() => window.open(`/customers/${params.id}/print-receipt?paymentId=${row.original.id}`)}>
        <Printer className="h-3 w-3" />
      </Button>
    ) : null },
  ];

  const statementCols: ColumnDef<any>[] = [
    { accessorKey: 'createdAt', header: 'Date', cell: ({ row }) => format(new Date(row.original.createdAt), 'MMM d, yyyy') },
    { accessorKey: 'referenceNumber', header: 'Reference', cell: ({ row }) => row.original.referenceNumber || '-' },
    { accessorKey: 'description', header: 'Description' },
    { id: 'debit', header: 'Debit', cell: ({ row }) => isDebit(row.original.type) ? <span className="text-red-600">{formatPkr(row.original.amount)}</span> : '-' },
    { id: 'credit', header: 'Credit', cell: ({ row }) => isCredit(row.original.type) ? <span className="text-emerald-600">{formatPkr(row.original.amount)}</span> : '-' },
    { accessorKey: 'balanceAfter', header: 'Balance', cell: ({ row }) => <span className={`font-semibold ${row.original.balanceAfter > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatPkr(row.original.balanceAfter)}</span> },
  ];

  const handleToggleActive = async () => {
    const action = customer?.isActive ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this customer?`)) return;
    try {
      await apiPut(`/customers/${params.id}`, { isActive: !customer?.isActive });
      load();
    } catch { alert('Failed to update customer status'); }
  };

  const handleDelete = async () => {
    if (!confirm(`Permanently delete ${customer?.fullName}? This cannot be undone.`)) return;
    try {
      await apiDelete(`/customers/${params.id}`);
      router.push('/customers');
    } catch { alert('Failed to delete customer'); }
  };

  if (loading) return <DetailPageSkeleton />;
  if (!customer) return <div className="text-center py-12 text-muted-foreground">Customer not found</div>;

  const utilPct = dashboardStats?.creditUtilization || 0;
  const utilColor = utilPct > 90 ? 'bg-red-500' : utilPct > 70 ? 'bg-yellow-500' : 'bg-emerald-500';

  const printRoutes: Record<string, string> = {
    overview: `/customers/${params.id}/print-profile`,
    ledger: `/customers/${params.id}/print-ledger${buildFilterQuery(ledgerFilter)}`,
    statement: `/customers/${params.id}/statement${buildDateQuery(ledgerFilter)}`,
    activity: `/customers/${params.id}/print-activity`,
  };

  function buildFilterQuery(f: typeof ledgerFilter) {
    const p = new URLSearchParams();
    if (f.startDate) p.set('startDate', f.startDate);
    if (f.endDate) p.set('endDate', f.endDate);
    if (f.type) p.set('type', f.type);
    const qs = p.toString();
    return qs ? `?${qs}` : '';
  }

  function buildDateQuery(f: typeof ledgerFilter) {
    const p = new URLSearchParams();
    if (f.startDate) p.set('startDate', f.startDate);
    if (f.endDate) p.set('endDate', f.endDate);
    const qs = p.toString();
    return qs ? `?${qs}` : '';
  }

  return (<div className="space-y-6">
    <Breadcrumb dynamicLabels={{ [params.id as string]: customer?.fullName }} />
    <PageHeader title={customer.fullName} description={`Code: ${customer.customerCode}`}>
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
      {hasPermission(user, 'customers.payments') && <Button variant="outline" size="sm" onClick={() => setShowPayment(true)}><Banknote className="h-4 w-4 mr-1.5" />Payment</Button>}
      <Button variant="outline" size="sm" onClick={() => window.open(printRoutes[activeTab] || printRoutes.overview, '_blank')}><RotateCcw className="h-4 w-4 mr-1.5" />Print</Button>
      {hasPermission(user, 'customers.update') && <Button size="sm" asChild><Link href={`/customers/${params.id}/edit`}><Pencil className="h-4 w-4 mr-1.5" />Edit</Link></Button>}
    </PageHeader>

    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList><TabsTrigger value="overview">Overview</TabsTrigger>
        {hasPermission(user, 'customers.view') && <TabsTrigger value="ledger">Ledger</TabsTrigger>}
        {hasPermission(user, 'customers.view') && <TabsTrigger value="statement">Statement</TabsTrigger>}
        {hasPermission(user, 'customers.view') && <TabsTrigger value="activity">Activity</TabsTrigger>}
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        {/* 6 Stat Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard title="Total Purchases" value={dashboardStats ? formatPkr(dashboardStats.totalPurchases) : '...'} description={dashboardStats ? `${dashboardStats.saleCount} sales` : ''} icon={ShoppingBag} variant="primary" />
          <StatCard title="Total Payments" value={dashboardStats ? formatPkr(dashboardStats.totalPayments) : '...'} description={dashboardStats ? `${dashboardStats.paymentCount} payments` : ''} icon={Banknote} variant="success" />
          <StatCard title="Total Returns" value={dashboardStats ? formatPkr(dashboardStats.totalReturns) : '...'} icon={RotateCcw} variant="warning" />
          <StatCard title="Balance" value={formatPkr(customer.currentBalance)} icon={DollarSign} variant={customer.currentBalance > 0 ? 'warning' : 'success'} />
          <StatCard title="Credit Limit" value={formatPkr(customer.creditLimit)} icon={CreditCard} variant="info" />
          <StatCard title="Available Credit" value={dashboardStats ? formatPkr(dashboardStats.availableCredit) : formatPkr(Math.max(0, customer.creditLimit - customer.currentBalance))} icon={CreditCard} variant={dashboardStats?.isOverCreditLimit ? 'danger' : 'default'} />
        </div>

        {/* Credit limit exceeded warning */}
        {customer.creditLimit > 0 && customer.currentBalance > customer.creditLimit && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
            <div>
              <span className="font-semibold">Credit Limit Exceeded &mdash; </span>
              This customer owes <strong>{formatPkr(customer.currentBalance)}</strong> against a limit of <strong>{formatPkr(customer.creditLimit)}</strong>.
              Excess: <span className="font-bold">{formatPkr(customer.currentBalance - customer.creditLimit)}</span>
            </div>
          </div>
        )}

        {/* Credit Utilization */}
        {customer.creditLimit > 0 && (
          <Card><CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="font-medium">Credit Utilization</span><span className={utilPct > 90 ? 'text-red-600 font-bold' : utilPct > 70 ? 'text-amber-600' : 'text-emerald-600'}>{utilPct}%</span></div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full transition-all ${utilColor}`} style={{ width: `${Math.min(utilPct, 100)}%` }} /></div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Used: {formatPkr(customer.currentBalance)}</span>
                <span>Limit: {formatPkr(customer.creditLimit)}</span>
                <span>Available: {formatPkr(dashboardStats?.availableCredit || Math.max(0, customer.creditLimit - customer.currentBalance))}</span>
              </div>
              {dashboardStats?.isOverCreditLimit && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-2 text-sm text-red-700 dark:text-red-400"><AlertTriangle className="h-4 w-4 shrink-0" />Credit limit exceeded!</div>
              )}
            </div>
          </CardContent></Card>
        )}

        {/* Contact Info */}
        <Card><CardHeader><CardTitle className="text-lg">Contact Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{customer.email || '-'}</span></div>
            <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{customer.phone || '-'}</span></div>
            <div className="col-span-2"><span className="text-muted-foreground">Address:</span> <span className="font-medium">{customer.address || '-'}</span></div>
            <div><span className="text-muted-foreground">Tax Number:</span> <span className="font-medium">{customer.taxNumber || '-'}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <Badge variant={customer.isActive ? 'default' : 'secondary'}>{customer.isActive ? 'Active' : 'Inactive'}</Badge></div>
          </CardContent>
        </Card>

        {/* Recent Activity + Recent Ledger */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
            <CardContent><div className="space-y-3">
              {activity.slice(0, 5).map((a: any) => (
                <div key={a.id} className="flex items-start gap-2 text-sm border-b pb-2 last:border-0">
                  <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{a.action.replace(/_/g, ' ')}</Badge>
                  <div className="min-w-0">
                    <p className="truncate">{a.description}</p>
                    <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
              {activity.length === 0 && <p className="text-sm text-muted-foreground">No recent activity</p>}
              <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => setActiveTab('activity')}>View All Activity →</Button>
            </div></CardContent>
          </Card>

          <Card><CardHeader><CardTitle className="text-lg">Recent Transactions</CardTitle></CardHeader>
            <CardContent><div className="space-y-1">
              {ledger.slice(0, 5).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between text-sm border-b pb-1.5 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${typeColors[e.type] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{e.type}</span>
                    <span className="text-xs text-muted-foreground truncate">{format(new Date(e.createdAt), 'MMM d')}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-medium">{formatPkr(e.amount)}</span>
                    <span className={`ml-2 text-xs ${e.balanceAfter > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatPkr(e.balanceAfter)}</span>
                  </div>
                </div>
              ))}
              {ledger.length === 0 && <p className="text-sm text-muted-foreground">No transactions</p>}
              <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => setActiveTab('ledger')}>View All Ledger →</Button>
            </div></CardContent>
          </Card>
        </div>
      </TabsContent>

      {hasPermission(user, 'customers.view') && <TabsContent value="ledger" className="space-y-4">
        <div className="flex items-center justify-between">
          <div><span className="text-sm text-muted-foreground">Current Balance: </span><span className={`text-lg font-bold ${customer.currentBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatPkr(customer.currentBalance)}</span></div>
          {hasPermission(user, 'customers.payments') && <Button size="sm" onClick={() => setShowPayment(true)}><CreditCard className="h-4 w-4 mr-1.5" />Add Payment</Button>}
        </div>
        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1"><Label className="text-xs">Start Date</Label><Input type="date" className="h-8 text-sm w-36" value={ledgerFilter.startDate} onChange={(e) => setLedgerFilter({ ...ledgerFilter, startDate: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">End Date</Label><Input type="date" className="h-8 text-sm w-36" value={ledgerFilter.endDate} onChange={(e) => setLedgerFilter({ ...ledgerFilter, endDate: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Type</Label>
            <select className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm" value={ledgerFilter.type} onChange={(e) => setLedgerFilter({ ...ledgerFilter, type: e.target.value })}>
              <option value="">All</option><option value="SALE">Sale</option><option value="PAYMENT">Payment</option><option value="REFUND">Refund</option><option value="ADJUSTMENT">Adjustment</option>
            </select>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={applyLedgerFilter}>Filter</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearLedgerFilter}>Clear</Button>
        </div>
        <DataTable columns={ledgerCols} data={ledger} loading={false} />
        {ledgerMeta?.totalPages > 1 && <div className="flex justify-between text-xs"><Button variant="outline" size="sm" disabled={ledgerPage <= 1} onClick={() => { setLedgerPage(ledgerPage - 1); loadLedger(ledgerPage - 1); }}>Previous</Button><span className="self-center text-muted-foreground">Page {ledgerPage} of {ledgerMeta.totalPages}</span><Button variant="outline" size="sm" disabled={ledgerPage >= ledgerMeta.totalPages} onClick={() => { setLedgerPage(ledgerPage + 1); loadLedger(ledgerPage + 1); }}>Next</Button></div>}
      </TabsContent>}

      {hasPermission(user, 'customers.view') && <TabsContent value="statement">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><span className="text-sm text-muted-foreground">Current Balance: </span><span className={`text-lg font-bold ${customer.currentBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatPkr(customer.currentBalance)}</span></div>
            <Button variant="outline" size="sm" onClick={() => window.open(printRoutes.statement, '_blank')}>Print Statement</Button>
          </div>
          <DataTable columns={statementCols} data={ledger} loading={false} />
        </div>
      </TabsContent>}

      {hasPermission(user, 'customers.view') && <TabsContent value="activity">
        <DataTable columns={[
          { accessorKey: 'createdAt', header: 'Date', cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString() },
          { accessorKey: 'action', header: 'Action', cell: ({ row }) => <Badge variant="secondary">{row.original.action.replace(/_/g, ' ')}</Badge> },
          { accessorKey: 'description', header: 'Description' },
        ]} data={activity} loading={loading} />
      </TabsContent>}
    </Tabs>

    <Dialog open={showPayment} onOpenChange={setShowPayment}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-center py-2"><p className="text-sm text-muted-foreground">Current Balance</p><p className="text-2xl font-bold">{formatPkr(customer.currentBalance)}</p></div>
          <div className="space-y-1"><Label>Amount *</Label><Input type="number" value={paymentForm.amount || ''} onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>Payment Method</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}>
              <option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label>Reference</Label><Input value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })} /></div></div>
          <div className="space-y-1"><Label>Notes</Label><textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></div>
          <Button className="w-full" onClick={handleAddPayment} disabled={saving}>{saving ? 'Recording...' : 'Record Payment'}</Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Danger Zone */}
    {hasPermission(user, 'customers.delete') || hasPermission(user, 'customers.update') ? (
      <div className="mt-8 border border-red-200 rounded-lg p-4 bg-red-50/30">
        <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Danger Zone
        </h3>
        <div className="flex flex-wrap gap-3">
          {hasPermission(user, 'customers.update') && (
            <div className="flex items-center justify-between flex-1 min-w-[280px] bg-white rounded border p-3">
              <div>
                <p className="text-sm font-medium">
                  {customer.isActive ? 'Deactivate Customer' : 'Activate Customer'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {customer.isActive
                    ? 'Prevents new sales and payments to this customer'
                    : 'Re-enables sales and payments for this customer'}
                </p>
              </div>
              <Button
                variant={customer.isActive ? 'destructive' : 'default'}
                size="sm"
                onClick={handleToggleActive}>
                {customer.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          )}
          {hasPermission(user, 'customers.delete') && (
            <div className="flex items-center justify-between flex-1 min-w-[280px] bg-white rounded border p-3">
              <div>
                <p className="text-sm font-medium">Delete Customer</p>
                <p className="text-xs text-muted-foreground">
                  {Number(customer.currentBalance) !== 0
                    ? 'Cannot delete — customer has outstanding balance'
                    : 'Permanently removes this customer record'}
                </p>
              </div>
              <Button
                variant="destructive" size="sm"
                disabled={Number(customer.currentBalance) !== 0}
                onClick={handleDelete}>
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    ) : null}
  </div>);
}
