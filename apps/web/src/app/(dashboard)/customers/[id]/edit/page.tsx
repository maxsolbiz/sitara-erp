'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGet, apiPut } from '@/lib/api';
import { toast } from 'sonner';
import { Breadcrumb } from '@/components/breadcrumb';
import { ArrowLeft, Save } from 'lucide-react';
import { useAuth, hasPermission } from '@/lib/auth';

export default function EditCustomerPage() {
  const { user } = useAuth();
  const params = useParams(); const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', address: '', city: '', taxNumber: '', creditLimit: 0, creditDays: 0, customerGroup: '', pricingTierId: 0, notes: '' });

  useEffect(() => {
    apiGet('/pricing-tiers').then((r: any) => { if (r?.data) setPricingTiers(r.data); }).catch(() => {});
    apiGet(`/customers/${params.id}`).then((r: any) => {
      if (r?.data) {
        setForm({
          fullName: r.data.fullName || '',
          email: r.data.email || '',
          phone: r.data.phone || '',
          address: r.data.address || '',
          city: r.data.city || '',
          taxNumber: r.data.taxNumber || '',
          creditLimit: Number(r.data.creditLimit) || 0,
          creditDays: r.data.creditDays ?? 0,
          customerGroup: r.data.customerGroup || '',
          pricingTierId: r.data.pricingTier ? Number(r.data.pricingTier.id) : 0,
          notes: r.data.notes || '',
        });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const res = await apiPut(`/customers/${params.id}`, form) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Customer updated'); router.push(`/customers/${params.id}`);
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (<div className="space-y-6">
    <Breadcrumb dynamicLabels={{ [params.id as string]: 'Customer', edit: 'Edit' }} />
    <PageHeader title="Edit Customer" description="Update customer information"><Button variant="outline" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button></PageHeader>
    <Card className="max-w-2xl"><CardHeader><CardTitle className="text-lg">Customer Information</CardTitle></CardHeader>
      <CardContent><form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2"><Label>Full Name *</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div className="space-y-2"><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Karachi" /></div>
          <div className="space-y-2"><Label>Customer Group</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.customerGroup} onChange={(e) => setForm({ ...form, customerGroup: e.target.value })}>
              <option value="">Select Group</option><option value="Retail">Retail</option><option value="Wholesale">Wholesale</option><option value="Gold">Gold</option><option value="Silver">Silver</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Payment Terms</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.creditDays} onChange={(e) => setForm({ ...form, creditDays: Number(e.target.value) })}>
              <option value={0}>Cash (No Credit)</option><option value={15}>Net 15 Days</option><option value={30}>Net 30 Days</option><option value={45}>Net 45 Days</option><option value={60}>Net 60 Days</option><option value={90}>Net 90 Days</option>
            </select>
          </div>
          <div className="space-y-2"><Label>Tax Number</Label><Input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} placeholder="NTN" /></div>
        </div>
        <div className="space-y-2"><Label>Notes</Label><textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes..." /></div>
        <div className="grid grid-cols-2 gap-4">
          {hasPermission(user, 'customers.update') && (
            <div className="space-y-2"><Label>Credit Limit (PKR)</Label><Input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} /></div>
          )}
          {hasPermission(user, 'pricing-tiers.view') && (
            <div className="space-y-2"><Label>Pricing Tier</Label><Select value={String(form.pricingTierId)} onValueChange={(v) => setForm({ ...form, pricingTierId: Number(v) })}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="0">None</SelectItem>{pricingTiers.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.discountPercent}% off)</SelectItem>)}</SelectContent></Select></div>
          )}
        </div>
        <Button type="submit" disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Customer'}</Button>
      </form></CardContent>
    </Card>
  </div>);
}
