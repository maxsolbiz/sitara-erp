'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { format } from 'date-fns';
import { BookOpen, FileText, ArrowRight, Plus, CalendarDays, AlertTriangle } from 'lucide-react';

export default function AccountingPage() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [activeYear, setActiveYear] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      apiGet('/accounting').catch(() => null),
      apiGet('/financial-years/active').catch(() => null),
    ]).then(([a, fy]) => {
      if (a?.data) setData(a.data);
      if (fy?.data) setActiveYear(fy.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (<div className="space-y-6">
    <PageHeader title="Accounting" description="Double-entry accounting and financial reports">
      <Button size="sm" asChild><Link href="/accounting/journal-entries/create"><Plus className="h-4 w-4 mr-1.5" />New Journal Entry</Link></Button>
    </PageHeader>

    {/* Active Financial Year */}
    {activeYear ? (
      <Link href="/accounting/financial-years" className="block">
        <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors cursor-pointer">
          <CardContent className="flex items-center gap-3 py-3">
            <CalendarDays className="h-5 w-5 text-emerald-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Active: <strong>{activeYear.name}</strong></p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {format(new Date(activeYear.startDate), 'MMM d, yyyy')} — {format(new Date(activeYear.endDate), 'MMM d, yyyy')}
                {(() => { const d = Math.ceil((new Date(activeYear.endDate).getTime() - Date.now()) / 86400000); return d > 0 ? ` (${d}d left)` : ''; })()}
              </p>
            </div>
            <Badge variant="outline" className="text-emerald-600 border-emerald-400">Manage</Badge>
          </CardContent>
        </Card>
      </Link>
    ) : (
      <Link href="/accounting/financial-years" className="block">
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors cursor-pointer">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">No active financial year. Click to create one.</p>
          </CardContent>
        </Card>
      </Link>
    )}
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-lg">Financial Reports</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {[
            { title: 'Trial Balance', href: '/accounting/trial-balance', desc: 'View all account balances' },
            { title: 'Profit & Loss', href: '/accounting/profit-loss', desc: 'Revenue vs expenses' },
            { title: 'Balance Sheet', href: '/accounting/balance-sheet', desc: 'Assets, liabilities & equity' },
          ].map((r) => (
            <Link key={r.href} href={r.href} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <div><p className="text-sm font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.desc}</p></div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-lg">Recent Journal Entries</CardTitle><Button variant="ghost" size="sm" asChild><Link href="/accounting/journal-entries">View All</Link></Button></CardHeader>
        <CardContent>
          {(!data?.recentEntries || data.recentEntries.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No journal entries yet.</p>
          ) : (
            <div className="space-y-2">{data.recentEntries.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div><p className="text-sm font-medium">{e.entryNumber}</p><p className="text-xs text-muted-foreground">{e.description?.slice(0, 50)}</p></div>
                <div className="text-right"><p className="text-sm font-medium">{formatPkr(e.totalDebit)}</p><p className="text-xs text-muted-foreground">{new Date(e.entryDate).toLocaleDateString()}</p></div>
              </div>
            ))}</div>
          )}
        </CardContent>
      </Card>
    </div>
  </div>);
}
