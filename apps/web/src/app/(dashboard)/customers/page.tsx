'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet, downloadFile } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { useAuth, hasPermission } from '@/lib/auth';
import { ColumnDef } from '@tanstack/react-table';
import { Users, Plus, UserCheck, DollarSign, FileDown, AlertTriangle, Download, X, Search } from 'lucide-react';

interface Customer {
  id: string; customerCode: string; fullName: string; email: string;
  phone: string; creditLimit: number; currentBalance: number; isActive: boolean;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [filterOverLimit, setFilterOverLimit] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const columns: ColumnDef<Customer>[] = useMemo(() => [
    { accessorKey: 'fullName', header: 'Customer', cell: ({ row }) => (
      <div><Link href={`/customers/${row.original.id}`} className="font-medium hover:text-primary">{row.original.fullName}</Link><p className="text-xs text-muted-foreground">{row.original.customerCode}</p></div>
    )},
    { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone || '-' },
    { accessorKey: 'email', header: 'Email', cell: ({ row }) => row.original.email || '-' },
    { accessorKey: 'creditLimit', header: 'Credit Limit', cell: ({ row }) => formatPkr(row.original.creditLimit) },
    { accessorKey: 'currentBalance', header: 'Balance', cell: ({ row }) => {
      const bal = Number(row.original.currentBalance);
      const lim = Number(row.original.creditLimit);
      const overLimit = lim > 0 && bal > lim;
      return (<div className="flex items-center gap-1.5">
        {overLimit && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
        <span className={bal > 0 ? (overLimit ? 'text-red-600 font-semibold' : 'text-red-600 font-medium') : 'text-emerald-600'}>{formatPkr(bal)}</span>
      </div>);
    }},
    { accessorKey: 'isActive', header: 'Status', cell: ({ row }) => <Badge variant={row.original.isActive ? 'default' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge> },
    { id: 'actions', header: '', cell: ({ row }) => (
      <div className="flex gap-1"><Button variant="ghost" size="sm" asChild><Link href={`/customers/${row.original.id}`}>View</Link></Button>{hasPermission(user, 'customers.update') && <Button variant="ghost" size="sm" asChild><Link href={`/customers/${row.original.id}/edit`}>Edit</Link></Button>}</div>
    )},
  ], [user]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let url = `/customers?page=${page}&perPage=20&search=${search}`;
      if (filterGroup)    url += `&customerGroup=${filterGroup}`;
      if (filterActive)   url += `&isActive=${filterActive}`;
      if (filterOverLimit) url += `&overLimitOnly=true`;
      const [listRes, statsRes] = await Promise.all([
        apiGet(url).catch(() => null),
        apiGet('/customers/stats').catch(() => null),
      ]);
      if (listRes?.data) setCustomers(listRes.data);
      if (listRes?.meta) setTotalPages(listRes.meta.totalPages || 1);
      if (statsRes?.data) setStats(statsRes.data);
      setLoading(false);
    }
    load();
  }, [search, filterGroup, filterActive, filterOverLimit, page]);

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description="Manage customer relationships">
        {hasPermission(user, 'reports.view') && <Link href="/customers/aging"><Button variant="outline" size="sm"><FileDown className="h-4 w-4 mr-1.5" />Aging Report</Button></Link>}
        <Button variant="outline" size="sm" onClick={() => downloadFile('/api/customers/export/csv', 'customers.csv')}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
        {hasPermission(user, 'customers.create') && <Button size="sm" asChild><Link href="/customers/create"><Plus className="h-4 w-4 mr-1.5" />Add Customer</Link></Button>}
      </PageHeader>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search by name, phone, email..." className="pl-8 h-9 text-sm"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setPage(1); }}>
          <option value="">All Groups</option>
          <option value="Retail">Retail</option>
          <option value="Wholesale">Wholesale</option>
          <option value="Gold">Gold</option>
          <option value="Silver">Silver</option>
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterActive} onChange={e => { setFilterActive(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer border rounded-md px-3 h-9 bg-background select-none">
          <input type="checkbox" checked={filterOverLimit}
            onChange={e => { setFilterOverLimit(e.target.checked); setPage(1); }}
            className="rounded" />
          Over Limit Only
        </label>
        {(filterGroup || filterActive || filterOverLimit) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterGroup(''); setFilterActive(''); setFilterOverLimit(false); setPage(1); }}>
            <X className="h-3.5 w-3.5 mr-1" />Clear Filters
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Customers" value={stats?.total ?? (loading ? '...' : '0')} icon={Users} variant="primary" />
        <StatCard title="Active" value={stats?.active ?? (loading ? '...' : '0')} icon={UserCheck} variant="success" />
        <StatCard title="Receivables" value={stats ? formatPkr(stats.totalReceivable) : (loading ? '...' : formatPkr(0))} icon={DollarSign} variant="warning" />
        <StatCard title="With Balance" value={stats?.withBalance ?? (loading ? '...' : '0')} icon={Users} variant="info" />
      </div>
      <DataTable columns={columns} data={customers} loading={loading} searchKey="fullName" searchPlaceholder="Search by name, phone, email..." />
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center text-xs">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
