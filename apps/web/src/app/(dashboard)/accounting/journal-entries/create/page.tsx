'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGet, apiPost } from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';

export default function CreateJournalEntryPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<{ accountId: number; accountName: string; debitAmount: number; creditAmount: number; description: string }[]>([]);

  useEffect(() => { apiGet('/accounting/chart-of-accounts').then((r: any) => { if (r?.data) setAccounts(r.data); }).catch(() => {}); }, []);

  const addLine = () => setLines([...lines, { accountId: 0, accountName: '', debitAmount: 0, creditAmount: 0, description: '' }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: any) => {
    const nl = [...lines]; (nl[i] as any)[field] = value;
    if (field === 'accountId') { const a = accounts.find((ac) => ac.id == value); if (a) nl[i].accountName = a.accountName; }
    setLines(nl);
  };
  const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
  const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanced) { toast.error('Debits must equal credits'); return; }
    if (lines.length < 2) { toast.error('Need at least 2 lines'); return; }
    setSaving(true);
    try {
      const res = await apiPost('/accounting/journal-entries', { entryDate, description, lines }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Journal entry created'); router.push('/accounting/journal-entries');
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Create Journal Entry" description="Manual accounting entry">
      <Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
    </PageHeader>
    <form onSubmit={handleSubmit}>
      <Card className="mb-6"><CardHeader><CardTitle className="text-lg">Entry Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required /></div>
          </div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={2} /></div>
        </CardContent>
      </Card>
      <Card className="mb-6"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-lg">Lines</CardTitle><Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="h-4 w-4 mr-1" />Add Line</Button></CardHeader>
        <CardContent className="space-y-2">
          {lines.length === 0 && <p className="text-sm text-muted-foreground py-4">Add at least 2 lines (one debit, one credit).</p>}
          {lines.map((line, i) => (<div key={i} className="flex items-start gap-2 border-b pb-3">
            <div className="flex-[2] space-y-1"><Label className="text-xs">Account</Label>
              <Select value={String(line.accountId)} onValueChange={(v) => updateLine(i, 'accountId', Number(v))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{accounts.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.accountCode} - {a.accountName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="w-24 space-y-1"><Label className="text-xs">Debit</Label><Input type="number" className="h-9" value={line.debitAmount || ''} onChange={(e) => updateLine(i, 'debitAmount', Number(e.target.value))} min={0} /></div>
            <div className="w-24 space-y-1"><Label className="text-xs">Credit</Label><Input type="number" className="h-9" value={line.creditAmount || ''} onChange={(e) => updateLine(i, 'creditAmount', Number(e.target.value))} min={0} /></div>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 mt-5" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>))}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm">Total Debit: <span className="font-bold">{totalDebit.toFixed(2)}</span></p>
          <p className="text-sm">Total Credit: <span className="font-bold">{totalCredit.toFixed(2)}</span></p>
          <p className={`text-sm font-medium ${balanced ? 'text-emerald-600' : 'text-red-600'}`}>
            {balanced ? '✓ Balanced' : `✗ Not balanced (diff: ${Math.abs(totalDebit - totalCredit).toFixed(2)})`}
          </p>
        </div>
        <Button type="submit" disabled={saving || !balanced}><Save className="h-4 w-4 mr-2" />{saving ? 'Creating...' : 'Create Entry'}</Button>
      </div>
    </form>
  </div>);
}
