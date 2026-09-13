'use client'; import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { FileDown, Users, AlertTriangle } from 'lucide-react';

export default function AgingReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');

  useEffect(() => {
    apiGet('/customers/reports/aging').then((r: any) => {
      if (r?.data) setData(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleExport = () => {
    if (!data?.report) return;
    const rows = [['Customer', 'Code', 'Group', 'Phone', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total Outstanding', 'Credit Limit', 'Status'].join(',')];
    for (const r of data.report) {
      const status = r.isOverLimit ? 'Over Limit' : r.totalOverdue > 0 ? 'Overdue' : 'Current';
      rows.push([r.fullName, r.customerCode, r.customerGroup || '', r.phone || '', r.buckets.current, r.buckets.days1_30, r.buckets.days31_60, r.buckets.days61_90, r.buckets.days91plus, r.currentBalance, r.creditLimit || 0, status].join(','));
    }
    rows.push(['TOTALS', '', '', '', data.totals.current, data.totals.days1_30, data.totals.days31_60, data.totals.days61_90, data.totals.days91plus, data.totals.total, '', ''].join(','));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `aging-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filtered = data?.report?.filter((r: any) => {
    if (search && !r.fullName.toLowerCase().includes(search.toLowerCase()) && !r.customerCode.toLowerCase().includes(search.toLowerCase())) return false;
    if (groupFilter && r.customerGroup !== groupFilter) return false;
    return true;
  }) || [];

  const groups = Array.from(new Set((data?.report || []).map((r: any) => r.customerGroup).filter(Boolean)));

  const statusBadge = (r: any) => {
    if (r.isOverLimit) return <Badge variant="destructive">Over Limit</Badge>;
    if (r.totalOverdue > 0) return <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-300">Overdue</Badge>;
    return <Badge variant="default" className="bg-emerald-600">Current</Badge>;
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (<div className="space-y-6">
    <PageHeader title="Accounts Receivable Aging" description="Customer account aging analysis">
      <Button variant="outline" size="sm" onClick={handleExport}><FileDown className="h-4 w-4 mr-1.5" />Export CSV</Button>
    </PageHeader>

    {/* Summary Cards */}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard title="Total Outstanding" value={data?.totals ? formatPkr(data.totals.total) : '0'} icon={Users} variant="primary" />
      <StatCard title="Current" value={data?.totals ? formatPkr(data.totals.current) : '0'} icon={Users} variant="info" />
      <StatCard title="1-30 Days" value={data?.totals ? formatPkr(data.totals.days1_30) : '0'} icon={Users} variant="warning" />
      <StatCard title="31-60 Days" value={data?.totals ? formatPkr(data.totals.days31_60) : '0'} icon={Users} variant="warning" />
      <StatCard title="61-90 Days" value={data?.totals ? formatPkr(data.totals.days61_90) : '0'} icon={Users} variant="danger" />
      <StatCard title="90+ Days" value={data?.totals ? formatPkr(data.totals.days91plus) : '0'} icon={Users} variant="danger" />
    </div>

    {/* Filters */}
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium">Search</label>
            <Input placeholder="Name or code..." className="h-8 w-56 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Group</label>
            <select className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">All Groups</option>
              {groups.map((g) => <option key={g as string} value={g as string}>{g as string}</option>)}
            </select>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Aging Table */}
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-2 font-medium">Customer</th>
              <th className="text-left p-2 font-medium">Group</th>
              <th className="text-left p-2 font-medium">Phone</th>
              <th className="text-right p-2 font-medium">Current</th>
              <th className="text-right p-2 font-medium">1-30 Days</th>
              <th className="text-right p-2 font-medium">31-60 Days</th>
              <th className="text-right p-2 font-medium">61-90 Days</th>
              <th className="text-right p-2 font-medium">90+ Days</th>
              <th className="text-right p-2 font-medium">Total</th>
              <th className="text-right p-2 font-medium">Credit Limit</th>
              <th className="text-left p-2 font-medium">Status</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">No accounts receivable data</td></tr>}
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => window.location.href = `/customers/${r.id}`}>
                  <td className="p-2"><div className="font-medium">{r.fullName}</div><div className="text-xs text-muted-foreground">{r.customerCode}</div></td>
                  <td className="p-2">{r.customerGroup || '-'}</td>
                  <td className="p-2">{r.phone || '-'}</td>
                  <td className="text-right p-2 font-medium">{formatPkr(r.buckets.current)}</td>
                  <td className="text-right p-2">{formatPkr(r.buckets.days1_30)}</td>
                  <td className="text-right p-2">{formatPkr(r.buckets.days31_60)}</td>
                  <td className="text-right p-2">{formatPkr(r.buckets.days61_90)}</td>
                  <td className="text-right p-2">{formatPkr(r.buckets.days91plus)}</td>
                  <td className="text-right p-2 font-bold">{formatPkr(r.currentBalance)}</td>
                  <td className="text-right p-2 text-muted-foreground">{r.creditLimit ? formatPkr(r.creditLimit) : '-'}</td>
                  <td className="p-2">{statusBadge(r)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-400 bg-muted/50 font-semibold">
                <td className="p-2" colSpan={3}>Totals ({filtered.length} customers)</td>
                <td className="text-right p-2">{formatPkr(data?.totals?.current || 0)}</td>
                <td className="text-right p-2">{formatPkr(data?.totals?.days1_30 || 0)}</td>
                <td className="text-right p-2">{formatPkr(data?.totals?.days31_60 || 0)}</td>
                <td className="text-right p-2">{formatPkr(data?.totals?.days61_90 || 0)}</td>
                <td className="text-right p-2">{formatPkr(data?.totals?.days91plus || 0)}</td>
                <td className="text-right p-2 font-bold">{formatPkr(data?.totals?.total || 0)}</td>
                <td className="text-right p-2"></td>
                <td className="p-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  </div>);
}
