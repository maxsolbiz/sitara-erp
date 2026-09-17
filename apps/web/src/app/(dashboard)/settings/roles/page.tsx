'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';

export default function SettingsRolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [permTarget, setPermTarget] = useState<any>(null);
  const [permIds, setPermIds] = useState<string[]>([]);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [rRes, pRes] = await Promise.all([apiGet('/rbac/roles').catch(() => null), apiGet('/rbac/permissions').catch(() => null)]);
    if (rRes?.data) setRoles(rRes.data);
    if (pRes?.data) setPermissions(pRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', description: '' }); setShowModal(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ name: r.name, description: r.description || '' }); setShowModal(true); };

  const openPermissions = (role: any) => {
    setPermTarget(role);
    setPermIds(role.permissions?.map((p: any) => p.slug) || []);
    setShowPerms(true);
  };

  const togglePerm = (slug: string) => {
    setPermIds((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        const res = await apiPut(`/rbac/roles/${editing.id}`, form) as any;
        if (res.error) { toast.error(res.error.detail); return; }
        toast.success('Role updated');
      } else {
        const res = await apiPost('/rbac/roles', form) as any;
        if (res.error) { toast.error(res.error.detail); return; }
        toast.success('Role created');
      }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handlePermissions = async () => {
    if (!permTarget) return;
    setSaving(true);
    try {
      const slugToId: Record<string, string> = {};
      for (const mods of Object.values(permissions)) {
        for (const p of mods) slugToId[p.slug] = p.id;
      }
      const ids = permIds.map((s) => slugToId[s]).filter(Boolean);
      const res = await apiPatch(`/rbac/roles/${permTarget.id}/permissions`, { permissionIds: ids }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Permissions updated'); setShowPerms(false); load();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this role?')) return;
    try {
      const res = await apiDelete(`/rbac/roles/${id}`) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Role deleted'); load();
    } catch (err: any) { toast.error(err.message); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Roles & Permissions" description="Manage user roles">
      <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />Add Role</Button>
    </PageHeader>
    <div className="rounded-lg border">
      <p className="text-xs text-muted-foreground px-3 pt-3">Built-in roles cannot be edited or deleted. Roles with assigned users cannot be deleted — unassign their users first.</p>
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/50">
          <th className="text-left p-3 font-medium">Role</th><th className="text-left p-3 font-medium">Users</th>
          <th className="text-left p-3 font-medium">Permissions</th><th className="text-left p-3 font-medium">Type</th>
          <th className="text-right p-3 font-medium">Actions</th>
        </tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="p-8 text-center">Loading...</td></tr>
          : roles.map((r) => (
            <tr key={r.id} className="border-b hover:bg-muted/30">
              <td className="p-3"><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.description}</div></td>
              <td className="p-3">{r.userCount}</td>
              <td className="p-3">
                <button onClick={() => openPermissions(r)} className="text-primary hover:underline text-xs">{r.permissionCount} permissions</button>
              </td>
              <td className="p-3">{r.isSystem ? <span className="text-xs text-muted-foreground">Built-in</span> : <span className="text-xs text-emerald-600">Custom</span>}</td>
              <td className="p-3 text-right space-x-1">
                <Button variant="ghost" size="sm" onClick={() => openPermissions(r)}><Shield className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(r)} disabled={r.isSystem} title={r.isSystem ? 'Built-in roles cannot be edited' : 'Edit role'}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)} disabled={r.isSystem || r.userCount > 0} title={r.isSystem ? 'Built-in roles cannot be deleted' : r.userCount > 0 ? 'Cannot delete roles with assigned users' : 'Delete role'}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{editing ? 'Edit Role' : 'Add Role'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Description</Label><textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update Role' : 'Create Role'}</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showPerms} onOpenChange={setShowPerms}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Permissions — {permTarget?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {Object.entries(permissions).map(([module, perms]) => (
            <div key={module}>
              <h4 className="text-sm font-medium capitalize mb-2 text-muted-foreground">{module}</h4>
              <div className="space-y-1">
                {perms.map((p: any) => (
                  <label key={p.slug} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                    <input type="checkbox" checked={permIds.includes(p.slug)} onChange={() => togglePerm(p.slug)} className="h-4 w-4" />
                    <span>{p.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{p.slug}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Button className="w-full" onClick={handlePermissions} disabled={saving}>{saving ? 'Saving...' : 'Save Permissions'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
