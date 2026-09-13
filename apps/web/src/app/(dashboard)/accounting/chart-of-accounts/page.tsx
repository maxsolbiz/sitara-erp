'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';

const typeColors: Record<string, string> = { ASSET: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300', LIABILITY: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300', EQUITY: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300', REVENUE: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300', EXPENSE: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' };

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/accounting/chart-of-accounts').then((r: any) => { if (r?.data) setAccounts(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return (<div className="space-y-6">
    <PageHeader title="Chart of Accounts" description="Manage your accounting structure" />
    <Card><CardContent className="p-0">
      <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account Name</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>
        {loading ? (<TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>) :
        accounts.length === 0 ? (<TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No accounts yet. Seed default accounts from Settings.</TableCell></TableRow>) :
        accounts.map((a: any) => (
          <TableRow key={a.id}>
            <TableCell className="font-mono text-xs">{a.accountCode}</TableCell>
            <TableCell className="font-medium">{a.accountName}</TableCell>
            <TableCell><Badge variant="outline" className={typeColors[a.accountType]}>{a.accountType}</Badge></TableCell>
            <TableCell className="text-right font-medium">{Number(a.currentBalance).toFixed(2)}</TableCell>
            <TableCell><Badge variant={a.isActive ? 'default' : 'secondary'}>{a.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
          </TableRow>
        ))}
      </TableBody></Table>
    </CardContent></Card>
  </div>);
}
