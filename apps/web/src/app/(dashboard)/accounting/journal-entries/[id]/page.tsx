'use client'; import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; import { apiGet, apiPost } from '@/lib/api';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge'; import { formatPkr } from '@/lib/utils';
import { ArrowLeft, RotateCcw, Printer } from 'lucide-react'; import { toast } from 'sonner';

export default function JournalEntryDetailPage() {
  const params = useParams(); const router = useRouter();
  const [entry, setEntry] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [showReverse, setShowReverse] = useState(false); const [reason, setReason] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiGet('/accounting/journal-entries').then((r: any) => {
      if (r?.data) {
        const found = r.data.find((e: any) => e.id === params.id);
        if (found) setEntry(found);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params.id]);
  const handleReverse = async () => {
    if (!reason) { toast.error('Reason required'); return; }
    setSaving(true);
    try { const res = await apiPost(`/accounting/journal-entries/${params.id}/reverse`, { reason }) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Entry reversed'); setShowReverse(false); }
    catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };
  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!entry) return <div className="text-center py-12 text-muted-foreground">Entry not found</div>;
  return (<div className="space-y-6">
    <PageHeader title={entry.entryNumber} description={entry.description}>
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
      {!entry.isReversed && <Button variant="outline" size="sm" onClick={() => setShowReverse(true)} className="text-amber-600"><RotateCcw className="h-4 w-4 mr-1.5" />Reverse</Button>}
    </PageHeader>
    <div className="flex gap-2 items-center"><Badge>{entry.isReversed ? 'REVERSED' : 'ACTIVE'}</Badge><span className="text-sm text-muted-foreground">{new Date(entry.entryDate).toLocaleDateString()}</span></div>
    <Card><CardHeader><CardTitle className="text-sm">Lines</CardTitle></CardHeader>
      <CardContent><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left p-2">Account</th><th className="text-right p-2">Debit</th><th className="text-right p-2">Credit</th></tr></thead>
        <tbody>{entry.lines?.map((l: any) => (<tr key={l.id} className="border-b"><td className="p-2">{l.account?.accountName || `Account #${l.accountId}`}</td><td className="p-2 text-right">{l.debitAmount > 0 ? formatPkr(l.debitAmount) : '-'}</td><td className="p-2 text-right">{l.creditAmount > 0 ? formatPkr(l.creditAmount) : '-'}</td></tr>))}</tbody>
        <tfoot><tr className="font-bold"><td className="p-2">Total</td><td className="p-2 text-right">{formatPkr(entry.totalDebit)}</td><td className="p-2 text-right">{formatPkr(entry.totalCredit)}</td></tr></tfoot>
      </table></CardContent>
    </Card>
    <Dialog open={showReverse} onOpenChange={setShowReverse}>
      <DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>Reverse Entry</DialogTitle></DialogHeader>
        <div className="space-y-3"><div className="space-y-1"><Label>Reason *</Label><textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this entry being reversed?" /></div><Button className="w-full" onClick={handleReverse} disabled={saving}>{saving ? 'Reversing...' : 'Reverse Entry'}</Button></div>
      </DialogContent>
    </Dialog>
  </div>);
}
