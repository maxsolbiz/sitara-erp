'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGet, apiPost, apiPut, downloadFile } from '@/lib/api';
import { Save, Building2, ShoppingCart, Printer, Mail, HardDrive, Globe, Settings as SettingsIcon, Download, Database } from 'lucide-react';
import { toast } from 'sonner';

interface SettingsState {
  company_name: string; company_address: string; company_phone: string; company_email: string;
  company_website: string; company_tax_number: string; company_city: string; company_country: string; company_currency: string;
  pos_default_payment_method: string; pos_receipt_auto_print: boolean; pos_show_product_images: boolean;
  pos_low_stock_threshold: number; pos_allow_negative_stock: boolean; pos_require_customer_on_credit: boolean;
  receipt_header: string; receipt_footer: string; receipt_show_tax: boolean; receipt_show_logo: boolean; receipt_paper_size: string;
  // Email settings
  email_service_provider: string; email_resend_api_key: string;
  email_smtp_host: string; email_smtp_port: string; email_smtp_user: string; email_smtp_pass: string;
  email_from_address: string; email_from_name: string;
  // Hardware settings
  hardware_printer_enabled: boolean; hardware_printer_type: string; hardware_printer_connection: string;
  hardware_printer_ip: string; hardware_printer_port: string; hardware_printer_paper_width: string;
  hardware_printer_char_per_line: string; hardware_printer_cut_paper: boolean; hardware_printer_open_drawer: boolean;
  hardware_scanner_enabled: boolean; hardware_scanner_type: string; hardware_scanner_prefix: string;
  hardware_scanner_suffix: string; hardware_scanner_auto_submit: boolean;
}

const DEFAULTS: SettingsState = {
  company_name: '', company_address: '', company_phone: '', company_email: '',
  company_website: '', company_tax_number: '', company_city: '', company_country: 'Pakistan', company_currency: 'PKR',
  pos_default_payment_method: 'CASH', pos_receipt_auto_print: true, pos_show_product_images: true,
  pos_low_stock_threshold: 10, pos_allow_negative_stock: false, pos_require_customer_on_credit: true,
  receipt_header: '', receipt_footer: 'Thank you for your business!', receipt_show_tax: false, receipt_show_logo: true, receipt_paper_size: '80mm',
  email_service_provider: 'none', email_resend_api_key: '',
  email_smtp_host: '', email_smtp_port: '', email_smtp_user: '', email_smtp_pass: '',
  email_from_address: '', email_from_name: '',
  hardware_printer_enabled: false, hardware_printer_type: 'epson', hardware_printer_connection: 'usb',
  hardware_printer_ip: '', hardware_printer_port: '9100', hardware_printer_paper_width: '80',
  hardware_printer_char_per_line: '48', hardware_printer_cut_paper: true, hardware_printer_open_drawer: true,
  hardware_scanner_enabled: false, hardware_scanner_type: 'usb', hardware_scanner_prefix: '',
  hardware_scanner_suffix: '\\n', hardware_scanner_auto_submit: true,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  // Secret fields show the server-side mask; only send a new value when the
  // user actually edits the field — never resubmit the mask as if real.
  const [secretDirty, setSecretDirty] = useState({ resend: false, smtpPass: false });
  const [logos, setLogos] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState('');

  const loadSettings = async (category: string) => {
    const res = await apiGet(`/settings/${category}`).catch(() => null);
    if (res?.data) {
      setSettings((prev) => ({ ...prev, ...res.data }));
    }
  };

  useEffect(() => {
    Promise.all([
      apiGet('/settings/company').catch(() => null),
      apiGet('/settings/pos').catch(() => null),
      apiGet('/settings/receipt').catch(() => null),
      apiGet('/settings/email').catch(() => null),
      apiGet('/settings/hardware').catch(() => null),
    ]).then(([company, pos, receipt, email, hardware]) => {
      if (company?.data) setSettings((p) => ({ ...p, ...company.data }));
      if (pos?.data) setSettings((p) => ({ ...p, ...pos.data }));
      if (receipt?.data) setSettings((p) => ({ ...p, ...receipt.data }));
      if (email?.data) setSettings((p) => ({ ...p, ...email.data }));
      if (hardware?.data) setSettings((p) => ({ ...p, ...hardware.data }));
      setLoading(false);
    });
  }, []);

  const handleSave = async (category: string) => {
    setSaving(category);
    const payload: Record<string, any> = {};
    const prefix = category === 'company' ? 'company_' : category === 'pos' ? 'pos_' : 'receipt_';
    for (const [key, value] of Object.entries(settings)) {
      if (key.startsWith(prefix) || (!key.startsWith('company_') && !key.startsWith('pos_') && !key.startsWith('receipt_'))) {
        payload[key] = value;
      }
    }
    try {
      if (category === 'email') {
        if (!secretDirty.resend) delete payload.email_resend_api_key;
        if (!secretDirty.smtpPass) delete payload.email_smtp_pass;
      }
      const res = await apiPut(`/settings/${category}`, payload) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      if (category === 'email') setSecretDirty({ resend: false, smtpPass: false });
      toast.success(`${category.charAt(0).toUpperCase() + category.slice(1)} settings saved`);
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(''); }
  };

  const update = (key: keyof SettingsState, value: any) => setSettings((prev) => ({ ...prev, [key]: value }));

  const loadLogos = async () => {
    const res = await apiGet('/settings/logos').catch(() => null);
    if (res?.data) setLogos(res.data);
  };

  useEffect(() => { loadLogos(); }, []);

  const handleLogoUpload = async (slot: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return; }
    setUploading(slot);
    try {
      const form = new FormData(); form.append('logo', file);
      const res = await fetch('/api/v1/settings/logos/' + slot, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.detail || 'Upload failed'); return; }
      toast.success('Logo uploaded'); loadLogos();
    } catch (err: any) { toast.error(err.message); } finally { setUploading(''); }
  };

  const handleLogoRevert = async (slot: string) => {
    try {
      const { apiDelete } = await import('@/lib/api');
      const res = await apiDelete(`/settings/logos/${slot}`) as any;
      if (res?.error) { toast.error(res.error.detail); return; }
      toast.success('Reverted to default'); loadLogos();
    } catch (err: any) { toast.error(err.message); }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your business configuration" />
      <Tabs defaultValue="company" className="space-y-6">
        <TabsList>
          <TabsTrigger value="company"><Building2 className="h-4 w-4 mr-1.5" />Company</TabsTrigger>
          <TabsTrigger value="pos"><ShoppingCart className="h-4 w-4 mr-1.5" />POS</TabsTrigger>
          <TabsTrigger value="receipt"><Printer className="h-4 w-4 mr-1.5" />Receipt</TabsTrigger>
          <TabsTrigger value="email"><Mail className="h-4 w-4 mr-1.5" />Email</TabsTrigger>
          <TabsTrigger value="branding"><Building2 className="h-4 w-4 mr-1.5" />Branding</TabsTrigger>
          <TabsTrigger value="hardware"><HardDrive className="h-4 w-4 mr-1.5" />Hardware</TabsTrigger>
          <TabsTrigger value="system"><SettingsIcon className="h-4 w-4 mr-1.5" />System</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6">
          <Card><CardHeader><CardTitle className="text-lg">Business Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Company Name</Label><Input value={settings.company_name} onChange={(e) => update('company_name', e.target.value)} /></div>
                <div className="space-y-2"><Label>City</Label><Input value={settings.company_city} onChange={(e) => update('company_city', e.target.value)} /></div>
              </div>
              <div className="space-y-2"><Label>Address</Label><textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.company_address} onChange={(e) => update('company_address', e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Phone</Label><Input value={settings.company_phone} onChange={(e) => update('company_phone', e.target.value)} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={settings.company_email} onChange={(e) => update('company_email', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Website</Label><Input value={settings.company_website} onChange={(e) => update('company_website', e.target.value)} /></div>
                <div className="space-y-2"><Label>Tax Number</Label><Input value={settings.company_tax_number} onChange={(e) => update('company_tax_number', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Country</Label><Input value={settings.company_country} onChange={(e) => update('company_country', e.target.value)} /></div>
                <div className="space-y-2"><Label>Currency</Label><Input value={settings.company_currency} onChange={(e) => update('company_currency', e.target.value)} /></div>
              </div>
              <Button onClick={() => handleSave('company')} disabled={saving === 'company'}><Save className="h-4 w-4 mr-2" />{saving === 'company' ? 'Saving...' : 'Save Company Settings'}</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pos" className="space-y-6">
          <Card><CardHeader><CardTitle className="text-lg">POS Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Default Payment Method</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.pos_default_payment_method} onChange={(e) => update('pos_default_payment_method', e.target.value)}>
                  <option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CREDIT">Credit</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2"><input type="checkbox" id="auto_print" checked={settings.pos_receipt_auto_print} onChange={(e) => update('pos_receipt_auto_print', e.target.checked)} className="h-4 w-4" /><Label htmlFor="auto_print">Auto-print receipt after sale</Label></div>
                <div className="flex items-center gap-2"><input type="checkbox" id="show_images" checked={settings.pos_show_product_images} onChange={(e) => update('pos_show_product_images', e.target.checked)} className="h-4 w-4" /><Label htmlFor="show_images">Show product images</Label></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Low Stock Threshold</Label><Input type="number" value={settings.pos_low_stock_threshold} onChange={(e) => update('pos_low_stock_threshold', Number(e.target.value))} /></div>
                <div className="flex items-center gap-2 pt-8"><input type="checkbox" id="neg_stock" checked={settings.pos_allow_negative_stock} onChange={(e) => update('pos_allow_negative_stock', e.target.checked)} className="h-4 w-4" /><Label htmlFor="neg_stock">Allow negative stock</Label></div>
              </div>
              <div className="flex items-center gap-2"><input type="checkbox" id="req_cust" checked={settings.pos_require_customer_on_credit} onChange={(e) => update('pos_require_customer_on_credit', e.target.checked)} className="h-4 w-4" /><Label htmlFor="req_cust">Require customer selection for credit sales</Label></div>
              <Button onClick={() => handleSave('pos')} disabled={saving === 'pos'}><Save className="h-4 w-4 mr-2" />{saving === 'pos' ? 'Saving...' : 'Save POS Settings'}</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipt" className="space-y-6">
          <Card><CardHeader><CardTitle className="text-lg">Receipt Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Receipt Header</Label><textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.receipt_header} onChange={(e) => update('receipt_header', e.target.value)} placeholder="e.g. Thank you for shopping!" /></div>
              <div className="space-y-2"><Label>Receipt Footer</Label><textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.receipt_footer} onChange={(e) => update('receipt_footer', e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Paper Size</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.receipt_paper_size} onChange={(e) => update('receipt_paper_size', e.target.value)}>
                    <option value="58mm">58mm</option><option value="80mm">80mm</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-8"><input type="checkbox" id="show_logo" checked={settings.receipt_show_logo} onChange={(e) => update('receipt_show_logo', e.target.checked)} className="h-4 w-4" /><Label htmlFor="show_logo">Show logo on receipt</Label></div>
              </div>
              <div className="flex items-center gap-2"><input type="checkbox" id="show_tax" checked={settings.receipt_show_tax} onChange={(e) => update('receipt_show_tax', e.target.checked)} className="h-4 w-4" /><Label htmlFor="show_tax">Show tax column on receipt</Label></div>
              <Button onClick={() => handleSave('receipt')} disabled={saving === 'receipt'}><Save className="h-4 w-4 mr-2" />{saving === 'receipt' ? 'Saving...' : 'Save Receipt Settings'}</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="space-y-6">
          <Card><CardHeader><CardTitle className="text-lg">Email Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Email Provider</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.email_service_provider || 'none'} onChange={(e) => update('email_service_provider', e.target.value)}>
                  <option value="none">None (disable email)</option><option value="resend">Resend</option><option value="smtp">SMTP</option>
                </select>
              </div>
              {settings.email_service_provider === 'resend' && <div className="space-y-2"><Label>Resend API Key</Label><Input type="password" value={settings.email_resend_api_key || ''} placeholder={settings.email_resend_api_key?.includes('•') ? 'Saved (masked) — type to replace' : 're_...'} onChange={(e) => { update('email_resend_api_key', e.target.value); setSecretDirty((p) => ({ ...p, resend: true })); }} /></div>}
              {settings.email_service_provider === 'smtp' && (<>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>SMTP Host</Label><Input value={settings.email_smtp_host || ''} onChange={(e) => update('email_smtp_host', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Port</Label><Input type="number" value={settings.email_smtp_port || ''} onChange={(e) => update('email_smtp_port', e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Username</Label><Input value={settings.email_smtp_user || ''} onChange={(e) => update('email_smtp_user', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Password</Label><Input type="password" value={settings.email_smtp_pass || ''} placeholder={settings.email_smtp_pass?.includes('•') ? 'Saved (masked) — type to replace' : ''} onChange={(e) => { update('email_smtp_pass', e.target.value); setSecretDirty((p) => ({ ...p, smtpPass: true })); }} /></div>
                </div>
              </>)}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>From Email</Label><Input value={settings.email_from_address || ''} onChange={(e) => update('email_from_address', e.target.value)} placeholder="noreply@company.com" /></div>
                <div className="space-y-2"><Label>From Name</Label><Input value={settings.email_from_name || ''} onChange={(e) => update('email_from_name', e.target.value)} placeholder="Company Name" /></div>
              </div>
              <Button onClick={() => handleSave('email')} disabled={saving === 'email'}><Save className="h-4 w-4 mr-2" />{saving === 'email' ? 'Saving...' : 'Save Email Settings'}</Button>
              <div className="flex items-center gap-2 pt-2">
                <Button variant="outline" onClick={async () => { toast.loading('Sending test email...'); try { const r = await apiPost('/settings/email/test', {}) as any; toast.dismiss(); if (r?.data?.message) toast.success(r.data.message); else toast.error(r?.error?.detail || 'Failed'); } catch { toast.dismiss(); toast.error('Failed to send test email'); } }}>Send Test Email</Button>
                <p className="text-xs text-muted-foreground">Sends to your own account email without saving anything.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-6">
          <Card><CardHeader><CardTitle className="text-lg">Logo Slots</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Upload a logo per slot (PNG, JPEG, or SVG, max 5MB). Empty slots fall back to the default logo.</p>
              {[['email-header', 'Email Header'], ['invoice-pdf', 'Invoice PDF'], ['web-app', 'Web App'], ['receipt-print', 'Receipt Print']].map(([slot, label]) => (
                <div key={slot} className="flex items-center gap-4 border rounded-lg p-4">
                  <div className="h-12 w-12 rounded bg-muted flex items-center justify-center overflow-hidden">
                    {logos[slot]?.path
                      ? <img src={logos[slot].path} alt={label} className="max-h-12 max-w-12 object-contain" />
                      : <span className="text-xs text-muted-foreground">Default</span>}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{slot}{logos[slot]?.updatedAt ? ` · updated ${String(logos[slot].updatedAt).slice(0, 10)}` : ''}</p>
                  </div>
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-input bg-background hover:bg-accent">
                      {uploading === slot ? 'Uploading...' : 'Upload'}
                    </span>
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => { handleLogoUpload(slot, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  {logos[slot]?.path && <Button variant="outline" size="sm" onClick={() => handleLogoRevert(slot)}>Revert</Button>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hardware" className="space-y-6">
          <Card><CardHeader><CardTitle className="text-lg">Receipt Printer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2"><input type="checkbox" id="printer_enabled" checked={settings.hardware_printer_enabled === true} onChange={(e) => update('hardware_printer_enabled', e.target.checked)} className="h-4 w-4" /><Label htmlFor="printer_enabled">Enable receipt printer</Label></div>
              {settings.hardware_printer_enabled && (<>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Printer Type</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.hardware_printer_type || 'epson'} onChange={(e) => update('hardware_printer_type', e.target.value)}><option value="epson">Epson</option><option value="star">Star</option><option value="bixolon">Bixolon</option><option value="generic">Generic ESC/POS</option></select></div>
                  <div className="space-y-2"><Label>Connection Type</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.hardware_printer_connection || 'usb'} onChange={(e) => update('hardware_printer_connection', e.target.value)}><option value="network">Network (IP)</option><option value="usb">USB</option></select></div>
                </div>
                {settings.hardware_printer_connection === 'network' && (<div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>IP Address</Label><Input value={settings.hardware_printer_ip || ''} onChange={(e) => update('hardware_printer_ip', e.target.value)} placeholder="192.168.1.100" /></div>
                  <div className="space-y-2"><Label>Port</Label><Input type="number" value={settings.hardware_printer_port || '9100'} onChange={(e) => update('hardware_printer_port', e.target.value)} /></div>
                </div>)}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Paper Width</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.hardware_printer_paper_width || '80'} onChange={(e) => update('hardware_printer_paper_width', e.target.value)}><option value="58">58mm</option><option value="80">80mm</option></select></div>
                  <div className="space-y-2"><Label>Chars per Line</Label><Input type="number" value={settings.hardware_printer_char_per_line || '48'} onChange={(e) => update('hardware_printer_char_per_line', e.target.value)} /></div>
                </div>
                <div className="flex items-center gap-2"><input type="checkbox" id="cut_paper" checked={settings.hardware_printer_cut_paper !== false} onChange={(e) => update('hardware_printer_cut_paper', e.target.checked)} className="h-4 w-4" /><Label htmlFor="cut_paper">Auto-cut paper after print</Label></div>
                <div className="flex items-center gap-2"><input type="checkbox" id="open_drawer" checked={settings.hardware_printer_open_drawer !== false} onChange={(e) => update('hardware_printer_open_drawer', e.target.checked)} className="h-4 w-4" /><Label htmlFor="open_drawer">Open cash drawer after sale</Label></div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={async () => { toast.loading('Testing...'); try { const r = await apiPost('/settings/hardware/test-print', {}) as any; toast.dismiss(); if (r.data?.success) toast.success('Test receipt sent!'); else toast.error(r.data?.reason || 'Failed'); } catch { toast.dismiss(); toast.error('Failed to test printer'); } }}>Test Print</Button>
                  <Button variant="outline" onClick={async () => { try { const r = await apiPost('/settings/hardware/open-drawer', {}) as any; if (r.data?.success) toast.success('Drawer opened!'); else toast.error(r.data?.reason || 'Failed'); } catch { toast.error('Failed'); } }}>Open Drawer</Button>
                </div>
              </>)}
              <Button onClick={() => handleSave('hardware')} disabled={saving === 'hardware'}><Save className="h-4 w-4 mr-2" />{saving === 'hardware' ? 'Saving...' : 'Save Hardware Settings'}</Button>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-lg">Barcode Scanner</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2"><input type="checkbox" id="scanner_enabled" checked={settings.hardware_scanner_enabled === true} onChange={(e) => update('hardware_scanner_enabled', e.target.checked)} className="h-4 w-4" /><Label htmlFor="scanner_enabled">Enable barcode scanner</Label></div>
              {settings.hardware_scanner_enabled && (<>
                <div className="space-y-2"><Label>Scanner Type</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.hardware_scanner_type || 'usb'} onChange={(e) => update('hardware_scanner_type', e.target.value)}><option value="usb">USB HID</option><option value="serial">Serial</option></select></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Prefix (hex/char)</Label><Input value={settings.hardware_scanner_prefix || ''} onChange={(e) => update('hardware_scanner_prefix', e.target.value)} placeholder="Leave blank if none" /></div>
                  <div className="space-y-2"><Label>Suffix</Label><Input value={settings.hardware_scanner_suffix || '\\n'} onChange={(e) => update('hardware_scanner_suffix', e.target.value)} placeholder="\\n (Enter)" /></div>
                </div>
                <div className="flex items-center gap-2"><input type="checkbox" id="auto_submit" checked={settings.hardware_scanner_auto_submit !== false} onChange={(e) => update('hardware_scanner_auto_submit', e.target.checked)} className="h-4 w-4" /><Label htmlFor="auto_submit">Auto-submit scan results</Label></div>
                <p className="text-xs text-muted-foreground">USB HID scanners work without configuration. Set prefix/suffix if your scanner adds extra characters.</p>
              </>)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <Card><CardHeader><CardTitle className="text-lg">System Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Version:</span> <span className="font-medium">0.1.0</span></div>
              <div><span className="text-muted-foreground">Environment:</span> <span className="font-medium">Development</span></div>
              <div><span className="text-muted-foreground">Node:</span> <span className="font-medium">20.x</span></div>
              <div><span className="text-muted-foreground">Database:</span> <span className="font-medium">PostgreSQL 16</span></div>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-lg"><Globe className="h-5 w-5 inline mr-2" />Currency & Regional</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Configure currency symbol, decimal places, and date format</p>
              <Button variant="outline" size="sm" asChild><a href="/settings/locale">Manage</a></Button>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-lg"><SettingsIcon className="h-5 w-5 inline mr-2" />Appearance</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Color theme for this device + organization default</p>
              <Button variant="outline" size="sm" asChild><a href="/settings/appearance">Manage</a></Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="mt-8">
        <CardHeader><CardTitle className="text-lg"><Database className="h-4 w-4 inline mr-1" />Backup &amp; Restore</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-1">Enterprise Backup Manager</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Create, download, validate, and restore database backups with full compression and checksum verification.
            </p>
            <Button variant="outline" asChild>
              <a href="/settings/backups">
                <Download className="h-4 w-4 mr-1.5" />
                Manage Backups
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
