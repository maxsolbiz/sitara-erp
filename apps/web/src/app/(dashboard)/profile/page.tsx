'use client'; import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header'; import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label'; import { Badge } from '@/components/ui/badge';
import { apiGet, apiPut, apiDelete } from '@/lib/api'; import { toast } from 'sonner'; import { Save, Key, LogOut, Monitor, Globe, Clock } from 'lucide-react';

interface Session { id: string; ipAddress: string; userAgent: string; startedAt: string; lastActivity: string; }

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null); const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [form, setForm] = useState({ fullName: '', email: '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState('');
  const [terminating, setTerminating] = useState('');

  useEffect(() => {
    apiGet('/auth/me').then((r: any) => {
      if (r?.data) { setUser(r.data); setForm({ fullName: r.data.fullName || '', email: r.data.email || '' }); }
      setLoading(false);
    }).catch(() => setLoading(false));
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const res = await apiGet('/auth/sessions').catch(() => null);
    if (res?.data) setSessions(res.data);
  };

  const handleProfile = async () => {
    setSaving('profile');
    try { const res = await apiPut('/auth/profile', { fullName: form.fullName, email: form.email }) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Profile updated'); }
    catch (err: any) { toast.error(err.message); } finally { setSaving(''); }
  };

  const handlePassword = async () => {
    if (pwForm.newPassword !== pwForm.confirmPassword) { toast.error('Passwords do not match'); return; }
    if (pwForm.newPassword.length < 8) { toast.error('Password must be 8+ characters'); return; }
    setSaving('password');
    try { const res = await apiPut('/auth/password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Password changed'); setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); }
    catch (err: any) { toast.error(err.message); } finally { setSaving(''); }
  };

  const terminateSession = async (sessionId: string) => {
    setTerminating(sessionId);
    try { const res = await apiDelete(`/auth/sessions/${sessionId}`) as any; if (res.error) { toast.error(res.error.detail); return; } toast.success('Session terminated'); loadSessions(); }
    catch (err: any) { toast.error(err.message); } finally { setTerminating(''); }
  };

  const terminateAllOthers = async () => {
    for (const s of sessions) {
      setTerminating(s.id);
      try { await apiDelete(`/auth/sessions/${s.id}`) as any; } catch {}
    }
    setTerminating('');
    toast.success('All other sessions terminated');
    loadSessions();
  };

  const parseDevice = (ua: string): string => {
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown Browser';
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  return (<div className="space-y-6">
    <PageHeader title="My Profile" description="Manage your account" />
    <Card><CardHeader><CardTitle className="text-lg">Personal Information</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1"><Label>Username</Label><Input value={user?.username || ''} readOnly className="bg-muted" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Full Name</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        </div>
        <div className="space-y-1"><Label>Roles</Label><div className="flex gap-2">{user?.roleAssignments?.map((r: any) => <Badge key={r.roleId || r.id} variant="default">{r.role?.name || r.name}</Badge>)}</div></div>
        <Button onClick={handleProfile} disabled={saving === 'profile'}><Save className="h-4 w-4 mr-2" />Save</Button>
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle className="text-lg"><Key className="h-4 w-4 inline mr-1" />Change Password</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1"><Label>Current Password</Label><Input type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>New Password</Label><Input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} /></div>
          <div className="space-y-1"><Label>Confirm New Password</Label><Input type="password" value={pwForm.confirmPassword} onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })} /></div>
        </div>
        <Button onClick={handlePassword} disabled={saving === 'password'}><Key className="h-4 w-4 mr-2" />Change Password</Button>
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle className="text-lg"><Monitor className="h-4 w-4 inline mr-1" />Active Sessions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {sessions.length === 0 ? <p className="text-sm text-muted-foreground">No active sessions</p> : <>
          <div className="space-y-2">
            {sessions.map((s, idx) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{parseDevice(s.userAgent)}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Globe className="h-3 w-3" />{s.ipAddress}
                      <Clock className="h-3 w-3 ml-1" />{new Date(s.lastActivity).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {idx === 0 && <Badge variant="default" className="text-[10px]">Current Session</Badge>}
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500"
                    disabled={terminating === s.id} onClick={() => terminateSession(s.id)}>
                    <LogOut className="h-3 w-3 mr-1" />Terminate
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {sessions.length > 1 && <Button variant="outline" size="sm" onClick={terminateAllOthers} disabled={terminating !== ''}>
            <LogOut className="h-4 w-4 mr-1" />Terminate All Other Sessions
          </Button>}
        </>}
      </CardContent>
    </Card>
  </div>);
}
