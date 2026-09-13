'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGet, apiPut } from '@/lib/api';
import { Save, Globe } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsLocalePage() {
  const [symbol, setSymbol] = useState('Rs.');
  const [decimals, setDecimals] = useState('0');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet('/settings/locale').then((res: any) => {
      if (res?.data) {
        if (res.data.locale_currency_symbol) setSymbol(res.data.locale_currency_symbol);
        if (res.data.locale_decimal_places) setDecimals(res.data.locale_decimal_places);
        if (res.data.locale_date_format) setDateFormat(res.data.locale_date_format);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiPut('/settings/locale', {
        locale_currency_symbol: symbol,
        locale_decimal_places: decimals,
        locale_date_format: dateFormat,
      }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Currency & regional settings saved');
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Currency & Regional Settings" description="Configure currency display, number format, and date format" />
      <Card>
        <CardHeader><CardTitle className="text-lg"><Globe className="h-5 w-5 inline mr-2" />Regional Formatting</CardTitle></CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label>Currency Symbol</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PKR">PKR</SelectItem>
                <SelectItem value="Rs.">Rs.</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Decimal Places</Label>
            <Select value={decimals} onValueChange={setDecimals}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0 (e.g. 1,000)</SelectItem>
                <SelectItem value="2">2 (e.g. 1,000.00)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date Format</Label>
            <Select value={dateFormat} onValueChange={setDateFormat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="MMM D, YYYY">MMM D, YYYY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Settings'}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
