'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Percent } from 'lucide-react';

export default function PricingTiersPage() {
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', discountPercent: 0 });

  const loadTiers = async () => {
    setLoading(true);
    const res = await apiGet('/pricing-tiers').catch(() => null);
    if (res?.data) setTiers(res.data);
    setLoading(false);
  };

  useEffect(() => { loadTiers(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', discountPercent: 0 }); setShowModal(true); };

  const openEdit = (tier: any) => { setEditing(tier); setForm({ name: tier.name, discountPercent: tier.discountPercent }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    try {
      if (editing) {
        const res = await apiPut(`/pricing-tiers/${editing.id}`, form) as any;
        if (res.error) { toast.error(res.error.detail); return; }
        toast.success('Tier updated');
      } else {
        const res = await apiPost('/pricing-tiers', form) as any;
        if (res.error) { toast.error(res.error.detail); return; }
        toast.success('Tier created');
      }
      setShowModal(false);
      loadTiers();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this pricing tier?')) return;
    try {
      const res = await apiDelete(`/pricing-tiers/${id}`) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Tier deleted');
      loadTiers();
    } catch (err: any) { toast.error(err.message); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Pricing Tiers" description="Manage customer pricing tiers">
      <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />Add Tier</Button>
    </PageHeader>
    <div className="rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Discount</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : tiers.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No pricing tiers defined</td></tr>
            ) : tiers.map((tier) => (
              <tr key={tier.id} className="border-b hover:bg-muted/30">
                <td className="p-3 font-medium">{tier.name}</td>
                <td className="p-3"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 text-xs font-medium text-emerald-700"><Percent className="h-3 w-3" />{tier.discountPercent}% off</span></td>
                <td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tier.isActive ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>{tier.isActive ? 'Active' : 'Inactive'}</span></td>
                <td className="p-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(tier)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(tier.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{editing ? 'Edit Tier' : 'Add Tier'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Wholesale" /></div>
          <div className="space-y-2"><Label>Discount %</Label><Input type="number" value={form.discountPercent || ''} onChange={(e) => setForm({ ...form, discountPercent: Number(e.target.value) })} min="0" max="100" /></div>
          <Button className="w-full" onClick={handleSave}>{editing ? 'Update Tier' : 'Create Tier'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
