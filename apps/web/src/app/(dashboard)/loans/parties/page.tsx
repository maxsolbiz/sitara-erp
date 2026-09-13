'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label'; import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiGet, apiPost } from '@/lib/api'; import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';

export default function LoanPartiesPage() {
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false); const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', type: 'INDIVIDUAL', cnic: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); const r = await apiGet('/loans/parties').catch(() => null); if (r?.data) setItems(r.data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', phone: '', email: '', type: 'INDIVIDUAL', cnic: '' }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    setSaving(true);
    try { const res = await apiPost('/loans/parties', form) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Created'); setShowModal(false); load(); }
    catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Loan Parties" description="Manage people and businesses"><Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New Party</Button></PageHeader>
    <div className="rounded-lg border">
      <table className="w-full text-sm"><thead><tr className="border-b bg-muted/50"><th className="text-left p-3 font-medium">Name</th><th className="text-left p-3 font-medium">Phone</th><th className="text-left p-3 font-medium">Type</th><th className="text-left p-3 font-medium">CNIC</th><th className="text-left p-3 font-medium">Loans Given</th><th className="text-left p-3 font-medium">Loans Taken</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={6} className="p-8 text-center">Loading...</td></tr> : items.map((p) => (<tr key={p.id} className="border-b"><td className="p-3 font-medium">{p.name}</td><td className="p-3">{p.phone || '-'}</td><td className="p-3"><Badge variant="secondary">{p.type}</Badge></td><td className="p-3">{p.cnic || '-'}</td><td className="p-3">{p.loansGivenCount}</td><td className="p-3">{p.loansTakenCount}</td></tr>))}</tbody>
      </table>
    </div>
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>New Party</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div><div className="space-y-1"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div></div>
          <div className="space-y-1"><Label>Type</Label><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="INDIVIDUAL">Individual</option><option value="BUSINESS">Business</option></select></div>
          <div className="space-y-1"><Label>CNIC</Label><Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Create'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
