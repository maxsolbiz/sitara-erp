'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/data-table'; import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiGet, apiPost } from '@/lib/api'; import { formatPkr } from '@/lib/utils';
import { toast } from 'sonner'; import { Plus, DollarSign, Landmark } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table'; import Link from 'next/link';

const sVar: Record<string, 'default'|'secondary'|'destructive'> = { ACTIVE: 'default', PARTIALLY_PAID: 'secondary', PAID: 'default', OVERDUE: 'destructive' };

export default function LoansPage() {
  const [loans, setLoans] = useState<any[]>([]); const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true); const [tab, setTab] = useState('GIVEN');
  const [parties, setParties] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: 'GIVEN', partyId: '', principalAmount: 0, interestRate: 0, startDate: '', dueDate: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [l, s, p] = await Promise.all([apiGet(`/loans?type=${tab}`), apiGet('/loans/stats'), apiGet('/loans/parties')]);
    if (l?.data) setLoans(l.data); if (s?.data) setStats(s.data); if (p?.data) setParties(p.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, [tab]);

  const cols: ColumnDef<any>[] = [
    { accessorKey: 'loanNumber', header: 'Loan #', cell: ({ row }) => <Link href={`/loans/${row.original.id}`} className="text-primary hover:underline font-medium">{row.original.loanNumber}</Link> },
    { accessorKey: 'partyName', header: 'Party' },
    { accessorKey: 'principalAmount', header: 'Amount', cell: ({ row }) => formatPkr(row.original.principalAmount) },
    { accessorKey: 'remainingAmount', header: 'Remaining', cell: ({ row }) => <span className="font-medium">{formatPkr(row.original.remainingAmount)}</span> },
    { accessorKey: 'startDate', header: 'Start', cell: ({ row }) => new Date(row.original.startDate).toLocaleDateString() },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={sVar[row.original.status] || 'outline'}>{row.original.status}</Badge> },
  ];

  const handleCreate = async () => {
    if (!form.partyId || !form.principalAmount) { toast.error('Party and amount required'); return; }
    setSaving(true);
    try {
      const res = await apiPost('/loans', { ...form, type: tab }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Loan created'); setShowModal(false); load();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Loans" description="Manage lending and borrowing">
      <Button size="sm" onClick={() => setShowModal(true)}><Plus className="h-4 w-4 mr-1.5" />New Loan</Button>
    </PageHeader>
    <div className="grid gap-3 sm:grid-cols-4">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><DollarSign className="h-3 w-3 inline mr-1" />Total Given</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(stats.totalGiven || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Receivable</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-amber-600">{formatPkr(stats.totalReceivable || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground"><Landmark className="h-3 w-3 inline mr-1" />Total Taken</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(stats.totalTaken || 0)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Payable</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-red-600">{formatPkr(stats.totalPayable || 0)}</p></CardContent></Card>
    </div>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList><TabsTrigger value="GIVEN">Loans Given</TabsTrigger><TabsTrigger value="TAKEN">Loans Taken</TabsTrigger></TabsList>
      <TabsContent value={tab}><DataTable columns={cols} data={loans} loading={loading} searchKey="loanNumber" /></TabsContent>
    </Tabs>
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>New {tab === 'GIVEN' ? 'Loan Given' : 'Loan Taken'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Party *</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}><option value="">Select...</option>{parties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <div className="space-y-1"><Label>Amount *</Label><Input type="number" value={form.principalAmount || ''} onChange={(e) => setForm({ ...form, principalAmount: Number(e.target.value) })} /></div>
          <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div><div className="space-y-1"><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div></div>
          <div className="space-y-1"><Label>Interest Rate %</Label><Input type="number" value={form.interestRate || ''} onChange={(e) => setForm({ ...form, interestRate: Number(e.target.value) })} /></div>
          <Button className="w-full" onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create Loan'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
