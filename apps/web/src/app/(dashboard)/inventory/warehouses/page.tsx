'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Warehouse as WarehouseIcon } from 'lucide-react';

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/inventory/warehouses').then((r: any) => { if (r?.data) setWarehouses(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return (<div className="space-y-6">
    <PageHeader title="Warehouses" description="Manage storage locations" />
    <Card><CardContent className="p-0">
      <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Manager</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>
        {loading ? (<TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>) :
        warehouses.length === 0 ? (<TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No warehouses yet.</TableCell></TableRow>) :
        warehouses.map((w: any) => (
          <TableRow key={w.id}>
            <TableCell className="font-mono text-xs font-medium">{w.code}</TableCell>
            <TableCell>{w.name}</TableCell>
            <TableCell>{w.managerName || '-'}</TableCell>
            <TableCell><Badge variant={w.isActive ? 'default' : 'secondary'}>{w.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
          </TableRow>
        ))}
      </TableBody></Table>
    </CardContent></Card>
  </div>);
}
