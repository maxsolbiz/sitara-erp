'use client'; import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; import { apiGet, apiPost } from '@/lib/api';
import { PageHeader } from '@/components/page-header'; import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label'; import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatPkr } from '@/lib/utils'; import { ArrowLeft, CreditCard } from 'lucide-react'; import { toast } from 'sonner';

const sVar: Record<string, 'default'|'secondary'|'destructive'> = { ACTIVE: 'default', PARTIALLY_PAID: 'secondary', PAID: 'default', OVERDUE: 'destructive' };

export default function LoanDetailPage() {
  const params = useParams(); const router = useRouter();
  const [loan, setLoan] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({ amount: 0, paymentMethod: 'CASH', paymentDate: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { apiGet(`/loans/${params.id}`).then((r: any) => { if (r?.data) setLoan(r.data); setLoading(false); }).catch(() => setLoading(false)); }, [params.id]);

  const handlePayment = async () => {
    if (payForm.amount <= 0) { toast.error('Positive amount required'); return; }
    setSaving(true);
    try { const res = await apiPost(`/loans/${params.id}/payments`, payForm) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Payment recorded'); setShowPayment(false); window.location.reload(); }
    catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  if (loading) return <div className="animate-spin h-8 w-8 m-12 border-4 border-primary border-t-transparent rounded-full" />;
  if (!loan) return <div className="text-center py-12 text-muted-foreground">Loan not found</div>;
  const progress = loan.principalAmount > 0 ? (loan.totalPaid / loan.principalAmount) * 100 : 0;

  return (<div className="space-y-6">
    <PageHeader title={loan.loanNumber} description={loan.partyName}><Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button></PageHeader>
    <div className="grid gap-3 sm:grid-cols-4">
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Amount</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatPkr(loan.principalAmount)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Paid</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-emerald-600">{formatPkr(loan.totalPaid)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Remaining</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-red-600">{formatPkr(loan.remainingAmount)}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Status</CardTitle></CardHeader><CardContent><Badge variant={sVar[loan.status] || 'outline'}>{loan.status}</Badge></CardContent></Card>
    </div>
    <div className="bg-muted/30 rounded-lg h-4 w-full overflow-hidden"><div className="bg-emerald-500 h-full transition-all" style={{ width: `${Math.min(progress, 100)}%` }} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><Card><CardHeader className="pb-1"><CardTitle className="text-sm">Details</CardTitle></CardHeader><CardContent className="text-sm space-y-1"><p><span className="text-muted-foreground">Type: </span>{loan.type === 'GIVEN' ? 'We Lent' : 'We Borrowed'}</p><p><span className="text-muted-foreground">Party: </span>{loan.partyName} ({loan.partyPhone})</p><p><span className="text-muted-foreground">Interest: </span>{loan.interestRate}%</p><p><span className="text-muted-foreground">Start: </span>{new Date(loan.startDate).toLocaleDateString()}</p><p><span className="text-muted-foreground">Due: </span>{loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : '-'}</p></CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Payments</CardTitle></CardHeader><CardContent>
        <Button size="sm" onClick={() => setShowPayment(true)} className="mb-2"><CreditCard className="h-4 w-4 mr-1.5" />Record Payment</Button>
        {loan.payments?.length > 0 ? <div className="space-y-1 max-h-40 overflow-y-auto">{loan.payments.map((p: any) => <div key={p.id} className="flex justify-between text-xs border-b py-1"><span>{new Date(p.paymentDate).toLocaleDateString()}</span><span className="font-medium">{formatPkr(p.amount)}</span><span className="text-muted-foreground">{p.paymentMethod}</span></div>)}</div> : <p className="text-xs text-muted-foreground">No payments yet</p>}
      </CardContent></Card>
    </div>
    <Dialog open={showPayment} onOpenChange={setShowPayment}>
      <DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-center py-2"><p className="text-sm text-muted-foreground">Remaining Balance</p><p className="text-2xl font-bold">{formatPkr(loan.remainingAmount)}</p></div>
          <div className="space-y-1"><Label>Amount *</Label><Input type="number" value={payForm.amount || ''} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>Payment Method</Label><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={payForm.paymentMethod} onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank Transfer</option></select></div>
          <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label>Date</Label><Input type="date" value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} /></div></div>
          <Button className="w-full" onClick={handlePayment} disabled={saving}>{saving ? 'Recording...' : 'Record Payment'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
