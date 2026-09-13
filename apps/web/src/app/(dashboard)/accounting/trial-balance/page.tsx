'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const typeColors: Record<string, string> = { ASSET: 'text-blue-600', LIABILITY: 'text-red-600', EQUITY: 'text-purple-600', REVENUE: 'text-emerald-600', EXPENSE: 'text-amber-600' };

export default function TrialBalancePage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/accounting/trial-balance').then((r: any) => { if (r?.data) setData(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return (<div className="space-y-6">
    <PageHeader title="Trial Balance" description="All account balances at a glance" />
    <Card>
      <CardHeader><CardTitle className="text-lg">Accounts</CardTitle></CardHeader>
      <CardContent>
        {loading ? (<p className="text-muted-foreground py-8 text-center">Loading...</p>) : !data || data.accounts.length === 0 ? (<p className="text-muted-foreground py-8 text-center">No accounts found. Seed default accounts or create journal entries first.</p>) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Code</TableHead><TableHead>Account Name</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.accounts.map((a: any) => (
                <TableRow key={a.code}>
                  <TableCell className="font-mono text-xs">{a.code}</TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><Badge variant="outline" className={typeColors[a.type]}>{a.type}</Badge></TableCell>
                  <TableCell className="text-right">{a.debit > 0 ? formatPkr(a.debit) : '-'}</TableCell>
                  <TableCell className="text-right">{a.credit > 0 ? formatPkr(a.credit) : '-'}</TableCell>
                  <TableCell className={`text-right font-medium ${a.balance >= 0 ? '' : 'text-red-600'}`}>{formatPkr(Math.abs(a.balance))}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-bold">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right">{formatPkr(data.totalDebit)}</TableCell>
                <TableCell className="text-right">{formatPkr(data.totalCredit)}</TableCell>
                <TableCell className="text-right"></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  </div>);
}
