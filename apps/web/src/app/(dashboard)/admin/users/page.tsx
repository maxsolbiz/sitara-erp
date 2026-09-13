'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api';
import { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';

interface User { id: string; username: string; email: string; fullName: string; isActive: boolean; isSuperAdmin: boolean; status: string; lastLogin: string | null; }
const columns: ColumnDef<User>[] = [
  { accessorKey: 'fullName', header: 'Name' },
  { accessorKey: 'username', header: 'Username' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'isSuperAdmin', header: 'Role', cell: ({ row }) => <Badge variant={row.original.isSuperAdmin ? 'default' : 'secondary'}>{row.original.isSuperAdmin ? 'Super Admin' : 'User'}</Badge> },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={row.original.status === 'active' ? 'default' : 'secondary'}>{row.original.status}</Badge> },
];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/settings/users').then((r: any) => { if (r?.data) setUsers(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return (<div className="space-y-6">
    <PageHeader title="Users" description="Manage system users"><Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add User</Button></PageHeader>
    <DataTable columns={columns} data={users} loading={loading} />
  </div>);
}
