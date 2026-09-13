'use client'; import { useEffect, useState } from 'react'; import Link from 'next/link';
import { PageHeader } from '@/components/page-header'; import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button'; import { DataTable } from '@/components/data-table';
import { apiGet } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import { DollarSign, TrendingUp, Package, AlertTriangle, RotateCcw, Wallet, ShoppingBag } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#06b6d4', '#f97316'];
const METHOD_LABELS: Record<string, string> = { CASH: 'Cash', CARD: 'Card', CREDIT: 'Credit', BANK_TRANSFER: 'Transfer' };

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null); const [salesChart, setSalesChart] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]); const [paymentBreakdown, setPaymentBreakdown] = useState<any[]>([]);
  const [pendingActions, setPendingActions] = useState<any>({});
  const [recentSales, setRecentSales] = useState<any[]>([]); const [lowStock, setLowStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { Promise.all([
    apiGet('/dashboard/stats'), apiGet('/dashboard/sales-chart'), apiGet('/dashboard/top-products'),
    apiGet('/dashboard/payment-breakdown'), apiGet('/dashboard/pending-actions'),
    apiGet('/dashboard/recent-sales'), apiGet('/dashboard/low-stock'),
  ]).then(([s, sc, tp, pb, pa, rs, ls]) => {
    if (s?.data) setStats(s.data); if (sc?.data) setSalesChart(sc.data); if (tp?.data) setTopProducts(tp.data);
    if (pb?.data) setPaymentBreakdown(pb.data); if (pa?.data) setPendingActions(pa.data);
    if (rs?.data) setRecentSales(rs.data); if (ls?.data) setLowStock(ls.data);
    setLoading(false);
  }).catch(() => setLoading(false)); }, []);

  const topCols: ColumnDef<any>[] = [
    { accessorKey: 'productName', header: 'Product' }, { accessorKey: 'unitsSold', header: 'Units' },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ row }) => formatPkr(row.original.revenue) },
  ];
  const recentCols: ColumnDef<any>[] = [
    { accessorKey: 'saleNumber', header: 'Sale #', cell: ({ row }) => <Link href={`/sales/${row.original.id}`} className="text-primary hover:underline">{row.original.saleNumber}</Link> },
    { accessorKey: 'customerName', header: 'Customer' },
    { accessorKey: 'total', header: 'Amount', cell: ({ row }) => formatPkr(row.original.total) },
  ];
  const stockCols: ColumnDef<any>[] = [
    { accessorKey: 'name', header: 'Product' }, { accessorKey: 'stock', header: 'Stock', cell: ({ row }) => <span className={row.original.stock <= (row.original.reorderLevel || 5) ? 'text-red-600 font-bold' : 'text-amber-600'}>{row.original.stock}</span> },
    { accessorKey: 'reorderLevel', header: 'Reorder At' },
  ];

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  const s = stats || {};
  const pa = pendingActions || {};

  return (<div className="space-y-6">
    <PageHeader title="Dashboard" description="Business overview" />

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Today's Revenue" value={formatPkr(s.todayRevenue || 0)} icon={DollarSign} variant="primary" />
      <StatCard title="This Month" value={formatPkr(s.monthlyRevenue || 0)} icon={TrendingUp} variant="success" />
      <StatCard title="Receivables" value={formatPkr(s.accountsReceivable || 0)} icon={Wallet} variant={s.accountsReceivable > 0 ? 'warning' : 'success'} />
      <StatCard title="Payables" value={formatPkr(s.accountsPayable || 0)} icon={ShoppingBag} variant={s.accountsPayable > 0 ? 'warning' : 'success'} />
    </div>

    {((pa.pendingReturns || 0) + (pa.pendingExpenses || 0) + (pa.lowStockCount || 0)) > 0 && (
      <div className="grid gap-3 sm:grid-cols-3">
        {pa.pendingReturns > 0 && <Link href="/sales/returns?status=PENDING"><Card className="border-amber-300 hover:shadow-md cursor-pointer"><CardContent className="flex items-center gap-3 p-4"><div className="bg-amber-100 rounded-full p-2"><RotateCcw className="h-5 w-5 text-amber-700" /></div><div><p className="text-sm font-medium text-amber-800">{pa.pendingReturns} return{pa.pendingReturns > 1 ? 's' : ''} awaiting approval</p><p className="text-xs text-amber-600">Click to view</p></div></CardContent></Card></Link>}
        {pa.pendingExpenses > 0 && <Link href="/expenses?status=PENDING"><Card className="border-amber-300 hover:shadow-md cursor-pointer"><CardContent className="flex items-center gap-3 p-4"><div className="bg-amber-100 rounded-full p-2"><Wallet className="h-5 w-5 text-amber-700" /></div><div><p className="text-sm font-medium text-amber-800">{pa.pendingExpenses} expense{pa.pendingExpenses > 1 ? 's' : ''} awaiting approval</p><p className="text-xs text-amber-600">Click to view</p></div></CardContent></Card></Link>}
        {pa.lowStockCount > 0 && <Link href="/inventory/stock?filter=low"><Card className="border-orange-300 hover:shadow-md cursor-pointer"><CardContent className="flex items-center gap-3 p-4"><div className="bg-orange-100 rounded-full p-2"><AlertTriangle className="h-5 w-5 text-orange-700" /></div><div><p className="text-sm font-medium text-orange-800">{pa.lowStockCount} product{pa.lowStockCount > 1 ? 's' : ''} low on stock</p><p className="text-xs text-orange-600">Click to view</p></div></CardContent></Card></Link>}
      </div>
    )}

    {salesChart.length > 0 && <Card><CardHeader><CardTitle className="text-base">Sales — Last 30 Days</CardTitle></CardHeader>
      <CardContent><ResponsiveContainer width="100%" height={250}><LineChart data={salesChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={(v: number) => formatPkr(v)} /><Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></CardContent>
    </Card>}

    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Top Products This Month</CardTitle></CardHeader>
        <CardContent>{topProducts.length > 0 ? <DataTable columns={topCols} data={topProducts} loading={false} /> : <p className="text-sm text-muted-foreground py-8 text-center">No data for this month</p>}</CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-base">Payment Breakdown</CardTitle></CardHeader>
        <CardContent>{paymentBreakdown.length > 0 ? <ResponsiveContainer width="100%" height={260}><PieChart><Pie data={paymentBreakdown.map(d => ({ ...d, label: METHOD_LABELS[d.method] || d.method }))} dataKey="amount" nameKey="label" cx="50%" cy="45%" innerRadius={50} outerRadius={80} paddingAngle={2}>{paymentBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />)}</Pie><Tooltip formatter={(v: number) => formatPkr(v)} /><Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} formatter={(value: string) => <span className="text-sm text-muted-foreground">{value}</span>} /></PieChart></ResponsiveContainer> : <p className="text-sm text-muted-foreground py-8 text-center">No data for this month</p>}</CardContent>
      </Card>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Recent Sales</CardTitle></CardHeader>
        <CardContent><DataTable columns={recentCols} data={recentSales.slice(0, 5)} loading={false} /></CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-base">Low Stock Alerts</CardTitle></CardHeader>
        <CardContent>{lowStock.length > 0 ? <DataTable columns={stockCols} data={lowStock.slice(0, 5)} loading={false} /> : <p className="text-sm text-muted-foreground py-8 text-center">All products well stocked</p>}</CardContent>
      </Card>
    </div>
  </div>);
}
