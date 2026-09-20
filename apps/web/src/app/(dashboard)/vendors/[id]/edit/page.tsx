'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiGet, apiPut } from '@/lib/api';
import { toast } from 'sonner';
import { Breadcrumb } from '@/components/breadcrumb';
import { ArrowLeft, Save } from 'lucide-react';

export default function EditVendorPage() {
  const params = useParams(); const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({ companyName: '', contactPerson: '', email: '', phone: '', address: '', taxNumber: '', paymentTerms: 30, creditLimit: 0 });

  useEffect(() => {
    apiGet(`/vendors/${params.id}`).then((r: any) => {
      if (r?.data) {
        const v = r.data;
        setForm({
          companyName: v.companyName || '',
          contactPerson: v.contactPerson || '',
          email: v.email || '',
          phone: v.phone || '',
          address: v.address || '',
          taxNumber: v.taxNumber || '',
          paymentTerms: v.paymentTerms ?? 30,
          creditLimit: Number(v.creditLimit) || 0,
        });
      } else {
        setNotFound(true);
        toast.error('Vendor not found');
      }
      setLoading(false);
    }).catch(() => { setNotFound(true); setLoading(false); });
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const res = await apiPut(`/vendors/${params.id}`, { ...form, paymentTerms: Number(form.paymentTerms), creditLimit: Number(form.creditLimit) }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Vendor updated'); router.push(`/vendors/${params.id}`);
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  if (notFound) return (<div className="space-y-6">
    <Breadcrumb dynamicLabels={{ [params.id as string]: 'Vendor', edit: 'Edit' }} />
    <PageHeader title="Vendor not found" description="This vendor does not exist or you do not have access." />
    <Button variant="outline" size="sm" onClick={() => router.replace('/vendors')}><ArrowLeft className="h-4 w-4 mr-1.5" />Back to Vendors</Button>
  </div>);

  return (<div className="space-y-6">
    <Breadcrumb dynamicLabels={{ [params.id as string]: 'Vendor', edit: 'Edit' }} />
    <PageHeader title="Edit Vendor" description="Update vendor information"><Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button></PageHeader>
    <Card className="max-w-2xl"><CardHeader><CardTitle className="text-lg">Vendor Information</CardTitle></CardHeader>
      <CardContent><form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2"><Label>Company Name *</Label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Contact Person</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
          <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-2"><Label>Tax Number</Label><Input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} /></div>
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
