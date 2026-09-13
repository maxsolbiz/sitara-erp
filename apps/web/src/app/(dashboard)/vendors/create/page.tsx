'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiPost } from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';

export default function CreateVendorPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ companyName: '', contactPerson: '', email: '', phone: '', address: '', taxNumber: '', paymentTerms: 30, creditLimit: 0 });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { const r = await apiPost('/vendors', form) as any; if (r.error) { toast.error(r.error.detail); return; } toast.success('Vendor created'); router.push('/vendors'); }
    catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };
  return (<div className="space-y-6">
    <PageHeader title="Add Vendor" description="Register a new supplier"><Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button></PageHeader>
    <Card className="max-w-2xl"><CardHeader><CardTitle className="text-lg">Vendor Information</CardTitle></CardHeader>
      <CardContent><form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2"><Label>Company Name *</Label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Contact Person</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
          <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-2"><Label>Tax Number</Label><Input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} placeholder="NTN" /></div>
        </div>
        <div className="space-y-2"><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Payment Terms (days)</Label><Input type="number" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Credit Limit</Label><Input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} /></div>
        </div>
        <Button type="submit" disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Vendor'}</Button>
      </form></CardContent>
    </Card>
  </div>);
}
