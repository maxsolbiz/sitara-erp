'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Key, Lock } from 'lucide-react';
import Link from 'next/link';

export default function SettingsUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [passwordTarget, setPasswordTarget] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState({ username: '', email: '', password: '', fullName: '', roleId: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [uRes, rRes] = await Promise.all([apiGet('/users').catch(() => null), apiGet('/rbac/roles').catch(() => null)]);
    if (uRes?.data) setUsers(uRes.data);
    if (rRes?.data) setRoles(rRes.data.filter((r: any) => r.slug !== 'admin'));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ username: '', email: '', password: '', fullName: '', roleId: '' }); setShowModal(true); };
  const openEdit = (u: any) => { setEditing(u); setForm({ username: u.username, email: u.email, password: '', fullName: u.fullName, roleId: u.roleAssignments?.[0]?.id || '' }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.fullName || !form.email) { toast.error('Name and email required'); return; }
    setSaving(true);
    try {
      if (editing) {
        const res = await apiPut(`/users/${editing.id}`, { fullName: form.fullName, email: form.email }) as any;
        if (res.error) { toast.error(res.error.detail); return; }
        if (form.roleId) await apiPatch(`/users/${editing.id}/roles`, { roleIds: [form.roleId] });
        toast.success('User updated');
      } else {
        if (!form.password || !form.username) { toast.error('Username and password required'); return; }
        const res = await apiPost('/users', { ...form, roleId: form.roleId || undefined }) as any;
        if (res.error) { toast.error(res.error.detail); return; }
        toast.success('User created');
      }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this user?')) return;
    try {
      const res = await apiDelete(`/users/${id}`) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('User deactivated'); load();
    } catch (err: any) { toast.error(err.message); }
  };

  const handlePassword = async () => {
    if (!newPassword || newPassword.length < 6) { toast.error('Password must be 6+ characters'); return; }
    setSaving(true);
    try {
      const res = await apiPatch(`/users/${passwordTarget.id}/password`, { password: newPassword }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Password updated'); setShowPassword(false); setNewPassword('');
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const roleColor = (slug: string) => {
    const colors: Record<string, string> = { admin: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300', manager: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300', cashier: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300', accountant: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300' };
    return colors[slug] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
  };

  // Mirror of the backend delete guards (user.routes.ts): cannot deactivate
  // yourself, nor the last remaining active admin.
  const isSelf = (u: any) => !!currentUser && String(u.id) === String(currentUser.id);
  const activeAdmins = users.filter((u: any) => u.isActive && u.roleAssignments?.some((r: any) => r.slug === 'admin'));
  const isLastAdmin = (u: any) =>
    !!u.isActive && u.roleAssignments?.some((r: any) => r.slug === 'admin') && activeAdmins.length <= 1;
  const deleteDisabledReason = (u: any): string | null => {
    if (isSelf(u)) return 'You cannot deactivate your own account';
    if (isLastAdmin(u)) return 'Cannot deactivate the last admin user';
    return null;
  };

  return (<div className="space-y-6">
    <PageHeader title="Users" description="Manage system users">
      <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />Add User</Button>
    </PageHeader>
    <div className="rounded-lg border">
      <p className="text-xs text-muted-foreground px-3 pt-3">You cannot deactivate your own account or the last remaining admin user.</p>
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/50">
          <th className="text-left p-3 font-medium">Name</th><th className="text-left p-3 font-medium">Email</th>
          <th className="text-left p-3 font-medium">Roles</th><th className="text-left p-3 font-medium">Status</th>
          <th className="text-left p-3 font-medium">Last Login</th><th className="text-right p-3 font-medium">Actions</th>
        </tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="p-8 text-center">Loading...</td></tr>
          : users.map((u) => (
            <tr key={u.id} className="border-b hover:bg-muted/30">
              <td className="p-3 font-medium">{u.fullName}</td>
              <td className="p-3 text-muted-foreground">{u.email}</td>
              <td className="p-3">
                <div className="flex gap-1 flex-wrap">
                  {u.roleAssignments?.map((r: any) => (
                    <Link key={r.id} href={`/settings/roles`} className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${roleColor(r.slug)}`}>{r.name}</Link>
                  ))}
                </div>
              </td>
              <td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${u.isActive ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
              <td className="p-3 text-muted-foreground">{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}</td>
              <td className="p-3 text-right space-x-1">
                <Button variant="ghost" size="sm" onClick={() => { setPasswordTarget(u); setShowPassword(true); }}><Key className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(u.id)} disabled={deleteDisabledReason(u) !== null} title={deleteDisabledReason(u) || 'Deactivate user'}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{editing ? 'Edit User' : 'Add User'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!editing && <div className="space-y-1"><Label>Username *</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>}
          <div className="space-y-1"><Label>Full Name *</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div className="space-y-1"><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          {!editing && <div className="space-y-1"><Label>Password *</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>}
          <div className="space-y-1"><Label>Role</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
              <option value="">No role</option>
              {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update User' : 'Create User'}</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showPassword} onOpenChange={setShowPassword}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Change Password</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Set new password for {passwordTarget?.fullName}</p>
          <Input type="password" placeholder="New password (6+ characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Button className="w-full" onClick={handlePassword} disabled={saving || !newPassword}><Lock className="h-4 w-4 mr-2" />Update Password</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
