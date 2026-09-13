'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiGet, apiPost, apiPut, apiPatch } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Plus, Pencil, Check, Lock, AlertTriangle, CalendarDays } from 'lucide-react';

export default function FinancialYearsPage() {
  const [years, setYears] = useState<any[]>([]);
  const [activeYear, setActiveYear] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', notes: '' });
  const [saving, setSaving] = useState(false);

  // Close year flow
  const [showClose, setShowClose] = useState(false);
  const [closeStep, setCloseStep] = useState(1);
  const [closePreview, setClosePreview] = useState<any>(null);
  const [closeConfirm, setCloseConfirm] = useState('');
  const [closingYear, setClosingYear] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const [yRes, aRes] = await Promise.all([apiGet('/financial-years'), apiGet('/financial-years/active')]);
    if (yRes?.data) setYears(yRes.data);
    if (aRes?.data) setActiveYear(aRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', startDate: '', endDate: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (y: any) => {
    setEditing(y);
    setForm({ name: y.name, startDate: y.startDate?.slice(0, 10), endDate: y.endDate?.slice(0, 10), notes: y.notes || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.startDate || !form.endDate) { toast.error('Name, start date, and end date required'); return; }
    if (new Date(form.endDate) <= new Date(form.startDate)) { toast.error('End date must be after start date'); return; }
    setSaving(true);
    try {
      if (editing) {
        const res = await apiPut(`/financial-years/${editing.id}`, form) as any;
        if (res.error) { toast.error(res.error.detail); return; }
        toast.success('Financial year updated');
      } else {
        const res = await apiPost('/financial-years', form) as any;
        if (res.error) { toast.error(res.error.detail); return; }
        toast.success('Financial year created');
      }
      setShowModal(false);
      load();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const activateYear = async (id: string) => {
    try {
      const res = await apiPatch(`/financial-years/${id}/activate`, {}) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Financial year activated');
      load();
    } catch (err: any) { toast.error(err.message); }
  };

  const openClose = async (y: any) => {
    setClosingYear(y);
    setCloseStep(1);
    setClosePreview(null);
    setCloseConfirm('');
    setShowClose(true);
  };

  const loadClosePreview = async () => {
    if (!closingYear) return;
    const res = await apiGet(`/financial-years/${closingYear.id}/preview`).catch(() => null);
    if (res?.data) { setClosePreview(res.data); setCloseStep(2); }
    else toast.error('Failed to load preview');
  };

  const handleClose = async () => {
    if (!closingYear || closeConfirm !== closingYear.name) { toast.error('Type the exact year name to confirm'); return; }
    setSaving(true);
    try {
      const res = await apiPost(`/financial-years/${closingYear.id}/close`, {}) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success(`Financial year ${closingYear.name} closed successfully`);
      setShowClose(false);
      load();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const statusBadge = (status: string) => {
    if (status === 'OPEN') return <Badge variant="default" className="bg-emerald-600">OPEN</Badge>;
    return <Badge variant="secondary">CLOSED</Badge>;
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (<div className="space-y-6">
    <PageHeader title="Financial Years" description="Manage fiscal periods and year-end closing">
      <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New Financial Year</Button>
    </PageHeader>

    {/* Active Year Banner */}
    {activeYear ? (
      <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800">
        <CardContent className="flex items-center gap-3 py-4">
          <CalendarDays className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-emerald-800 dark:text-emerald-300">Active Year: <strong>{activeYear.name}</strong></p>
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {format(new Date(activeYear.startDate), 'MMM d, yyyy')} — {format(new Date(activeYear.endDate), 'MMM d, yyyy')}
              {(() => {
                const daysLeft = Math.ceil((new Date(activeYear.endDate).getTime() - Date.now()) / 86400000);
                return daysLeft > 0 ? ` (${daysLeft} days remaining)` : ' (ended)';
              })()}
            </p>
          </div>
        </CardContent>
      </Card>
    ) : (
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
        <CardContent className="flex items-center gap-3 py-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">No active financial year. Create one to enable period-based reporting.</p>
        </CardContent>
      </Card>
    )}

    {/* Years Table */}
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Start Date</th>
              <th className="text-left p-3 font-medium">End Date</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Notes</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {years.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No financial years yet. Create your first financial year.</td></tr>}
              {years.map((y: any) => (
                <tr key={y.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{y.name}</td>
                  <td className="p-3">{format(new Date(y.startDate), 'MMM d, yyyy')}</td>
                  <td className="p-3">{format(new Date(y.endDate), 'MMM d, yyyy')}</td>
                  <td className="p-3">{statusBadge(y.status)}</td>
                  <td className="p-3 text-muted-foreground">{y.notes || '-'}</td>
                  <td className="p-3 text-right">
                    {y.status === 'OPEN' ? (
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(y)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                        {activeYear?.id !== y.id && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => activateYear(y.id)}><Check className="h-3 w-3 mr-1" />Set Active</Button>}
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => openClose(y)}><Lock className="h-3 w-3 mr-1" />Close Year</Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Closed {y.closedAt ? format(new Date(y.closedAt), 'MMM d, yyyy') : ''}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    {/* Create/Edit Modal */}
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? 'Edit Financial Year' : 'New Financial Year'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. FY 2025-26" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Start Date *</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div className="space-y-1"><Label>End Date *</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label>Notes</Label><textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Close Year Modal */}
    <Dialog open={showClose} onOpenChange={setShowClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Close Financial Year</DialogTitle>
          <DialogDescription>{closingYear?.name} — {closingYear ? `${format(new Date(closingYear.startDate), 'MMM d, yyyy')} to ${format(new Date(closingYear.endDate), 'MMM d, yyyy')}` : ''}</DialogDescription>
        </DialogHeader>

        {closeStep === 1 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-300">Closing a financial year is permanent and cannot be undone.</p>
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">All revenue and expense accounts will be zeroed out and transferred to Retained Earnings.</p>
                </div>
              </div>
            </div>
            <Button className="w-full" onClick={loadClosePreview}>Continue to Preview</Button>
          </div>
        )}

        {closeStep === 2 && closePreview && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Total Revenue</span><span className="font-medium text-emerald-600">{formatPkr(closePreview.revenue.total)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Expenses</span><span className="font-medium text-red-600">{formatPkr(closePreview.expenses.total)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1"><span>Net {closePreview.netIncome >= 0 ? 'Income' : 'Loss'}</span><span className={closePreview.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatPkr(Math.abs(closePreview.netIncome))}</span></div>
              </div>
              <p className="text-sm text-muted-foreground">This will create <strong>{closePreview.closingEntriesCount}</strong> closing journal entries.</p>
            </div>
            <Button className="w-full" onClick={() => setCloseStep(3)}>Proceed to Close</Button>
            <Button variant="outline" className="w-full" onClick={() => setCloseStep(1)}>Back</Button>
          </div>
        )}

        {closeStep === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
              <strong>Final confirmation.</strong> Type <code className="font-mono bg-red-100 dark:bg-red-900 px-1 rounded">{closingYear?.name}</code> below to confirm.
            </div>
            <Input placeholder={`Type "${closingYear?.name}" to confirm`} value={closeConfirm} onChange={(e) => setCloseConfirm(e.target.value)} />
            <Button className="w-full" disabled={closeConfirm !== closingYear?.name || saving} onClick={handleClose}>
              {saving ? 'Closing...' : <><Lock className="h-4 w-4 mr-2" />Close {closingYear?.name}</>}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setCloseStep(2)}>Back</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  </div>);
}
