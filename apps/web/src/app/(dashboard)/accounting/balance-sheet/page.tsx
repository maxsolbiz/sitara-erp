'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function BalanceSheetPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/accounting/balance-sheet').then((r: any) => { if (r?.data) setData(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  const total = data ? data.assets.total : 0;
  const totalEq = data ? data.liabilities.total + data.equity.total : 0;
  return (<div className="space-y-6">
    <PageHeader title="Balance Sheet" description="Assets, Liabilities & Equity" />
    {loading ? (<p className="text-muted-foreground text-center py-12">Loading...</p>) : !data ? (<p className="text-muted-foreground text-center py-12">No data.</p>) : (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1"><CardHeader><CardTitle className="text-lg text-blue-600">Assets</CardTitle></CardHeader>
          <CardContent><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>{data.assets.items.length === 0 ? (<TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No assets</TableCell></TableRow>) : data.assets.items.map((a: any) => (<TableRow key={a.code}><TableCell>{a.name}</TableCell><TableCell className="text-right font-medium">{formatPkr(a.balance)}</TableCell></TableRow>))}
              <TableRow className="border-t-2 font-bold"><TableCell>Total Assets</TableCell><TableCell className="text-right">{formatPkr(data.assets.total)}</TableCell></TableRow>
            </TableBody></Table>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2"><CardContent className="space-y-6 pt-6">
          <div><h3 className="text-lg font-semibold text-red-600 mb-2">Liabilities</h3>
            <Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>{data.liabilities.items.length === 0 ? (<TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No liabilities</TableCell></TableRow>) : data.liabilities.items.map((a: any) => (<TableRow key={a.code}><TableCell>{a.name}</TableCell><TableCell className="text-right font-medium">{formatPkr(a.balance)}</TableCell></TableRow>))}
              <TableRow className="border-t-2 font-bold"><TableCell>Total Liabilities</TableCell><TableCell className="text-right">{formatPkr(data.liabilities.total)}</TableCell></TableRow>
            </TableBody></Table>
          </div>
          <div><h3 className="text-lg font-semibold text-purple-600 mb-2">Equity</h3>
            <Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>{data.equity.items.length === 0 ? (<TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No equity accounts</TableCell></TableRow>) : data.equity.items.map((a: any) => (<TableRow key={a.code}><TableCell>{a.name}</TableCell><TableCell className="text-right font-medium">{formatPkr(a.balance)}</TableCell></TableRow>))}
              <TableRow className="border-t-2 font-bold"><TableCell>Total Equity</TableCell><TableCell className="text-right">{formatPkr(data.equity.total)}</TableCell></TableRow>
            </TableBody></Table>
          </div>
          <div className="border-t-2 pt-4 flex justify-between text-lg font-bold">
            <span>Total Liabilities & Equity</span>
            <span className={Math.abs(total - totalEq) < 0.01 ? 'text-emerald-600' : 'text-red-600'}>{formatPkr(totalEq)}</span>
          </div>
          <div className="text-xs text-muted-foreground text-center">
            {Math.abs(total - totalEq) < 0.01 ? '✓ Balance Sheet is balanced' : '⚠ Balance Sheet is NOT balanced'}
          </div>
        </CardContent></Card>
      </div>
    )}
  </div>);
}
