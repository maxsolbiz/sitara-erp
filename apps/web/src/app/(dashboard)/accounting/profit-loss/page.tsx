'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function ProfitLossPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/accounting/profit-loss').then((r: any) => { if (r?.data) setData(r.data); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return (<div className="space-y-6">
    <PageHeader title="Profit & Loss Statement" description="Revenue vs Expenses" />
    {loading ? (<p className="text-muted-foreground text-center py-12">Loading...</p>) : !data ? (<p className="text-muted-foreground text-center py-12">No data. Create journal entries first.</p>) : (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-600" />Revenue</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.revenue.items.length === 0 ? (<TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No revenue accounts</TableCell></TableRow>) :
                data.revenue.items.map((a: any) => (<TableRow key={a.code}><TableCell>{a.name}</TableCell><TableCell className="text-right font-medium text-emerald-600">{formatPkr(a.balance)}</TableCell></TableRow>))}
              <TableRow className="border-t-2 font-bold"><TableCell>Total Revenue</TableCell><TableCell className="text-right text-emerald-600">{formatPkr(data.revenue.total)}</TableCell></TableRow>
            </TableBody></Table>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-600" />Expenses</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.expenses.items.length === 0 ? (<TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No expense accounts</TableCell></TableRow>) :
                data.expenses.items.map((a: any) => (<TableRow key={a.code}><TableCell>{a.name}</TableCell><TableCell className="text-right font-medium text-red-600">{formatPkr(a.balance)}</TableCell></TableRow>))}
              <TableRow className="border-t-2 font-bold"><TableCell>Total Expenses</TableCell><TableCell className="text-right text-red-600">{formatPkr(data.expenses.total)}</TableCell></TableRow>
            </TableBody></Table>
          </CardContent>
        </Card>
      </div>
    )}
    <Card className={data?.netProfit >= 0 ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800' : 'border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800'}>
      <CardContent className="py-6 text-center">
        <p className="text-lg text-muted-foreground">Net {data?.netProfit >= 0 ? 'Profit' : 'Loss'}</p>
        <p className={`text-3xl font-bold ${data?.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {data ? formatPkr(Math.abs(data.netProfit)) : '-'}
        </p>
      </CardContent>
    </Card>
  </div>);
}
