'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiGet, downloadFile } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { useAuth, hasPermission } from '@/lib/auth';
import { ColumnDef } from '@tanstack/react-table';
import { Building2, Plus, UserCheck, DollarSign, Users, Download } from 'lucide-react';

interface Vendor { id: string; code: string; companyName: string; contactPerson: string; email: string; phone: string; creditLimit: number; currentBalance: number; isActive: boolean; }

export default function VendorsPage() {
  const [items, setItems] = useState<Vendor[]>([]); const [stats, setStats] = useState<any>(null); const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const columns: ColumnDef<Vendor>[] = useMemo(() => [
    { accessorKey: 'companyName', header: 'Vendor', cell: ({ row }) => (<div><Link href={`/vendors/${row.original.id}`} className="font-medium hover:text-primary">{row.original.companyName}</Link><p className="text-xs text-muted-foreground">{row.original.code}</p></div>) },
    { accessorKey: 'contactPerson', header: 'Contact' },
    { accessorKey: 'phone', header: 'Phone' },
    { accessorKey: 'creditLimit', header: 'Credit', cell: ({ row }) => formatPkr(row.original.creditLimit) },
    { accessorKey: 'currentBalance', header: 'Balance', cell: ({ row }) => (<span className={row.original.currentBalance > 0 ? 'text-red-600 font-medium' : 'text-emerald-600'}>{formatPkr(row.original.currentBalance)}</span>) },
    { accessorKey: 'isActive', header: 'Status', cell: ({ row }) => <Badge variant={row.original.isActive ? 'default' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge> },
    { id: 'actions', header: '', cell: ({ row }) => (<div className="flex gap-1"><Button variant="ghost" size="sm" asChild><Link href={`/vendors/${row.original.id}`}>View</Link></Button>{hasPermission(user, 'vendors.update') && <Button variant="ghost" size="sm" asChild><Link href={`/vendors/${row.original.id}/edit`}>Edit</Link></Button>}</div>) },
  ], [user]);

  useEffect(() => { async function load() { const [r, s] = await Promise.all([apiGet('/vendors').catch(() => null), apiGet('/vendors/stats').catch(() => null)]); if (r?.data) setItems(r.data); if (s?.data) setStats(s.data); setLoading(false); } load(); }, []);
  return (<div className="space-y-6"><PageHeader title="Vendors" description="Manage suppliers"><Button variant="outline" size="sm" onClick={() => downloadFile('/api/vendors/export/csv', 'vendors.csv')}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>{hasPermission(user, 'vendors.create') && <Button size="sm" asChild><Link href="/vendors/create"><Plus className="h-4 w-4 mr-1.5" />Add Vendor</Link></Button>}</PageHeader>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Total Vendors" value={stats?.total ?? (loading ? '...' : '0')} icon={Building2} variant="primary" />
      <StatCard title="Active" value={stats?.active ?? (loading ? '...' : '0')} icon={UserCheck} variant="success" />
      <StatCard title="Payables" value={stats ? formatPkr(stats.totalPayable) : (loading ? '...' : formatPkr(0))} icon={DollarSign} variant="warning" />
      <StatCard title="With Balance" value={stats?.withBalance ?? (loading ? '...' : '0')} icon={Users} variant="info" />
    </div>
    <DataTable columns={columns} data={items} loading={loading} searchKey="companyName" searchPlaceholder="Search by name, code, phone..." />
  </div>);
}
