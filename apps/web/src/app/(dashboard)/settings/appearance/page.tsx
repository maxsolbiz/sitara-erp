'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { apiGet, apiPut } from '@/lib/api';
import { useThemeColor, THEME_COLORS, type ThemeColor } from '@/lib/theme-color';
import { useAuth, hasPermission } from '@/lib/auth';
import { Save, Palette, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const THEME_META: Record<ThemeColor, { name: string; desc: string; swatch: string }> = {
  default: { name: 'Default Blue', desc: 'Current house theme', swatch: 'bg-blue-600' },
  emerald: { name: 'Emerald', desc: 'Green, high-contrast on white', swatch: 'bg-emerald-600' },
  amber: { name: 'Amber', desc: 'Warm orange, distinct in low light', swatch: 'bg-amber-500' },
};

export default function SettingsAppearancePage() {
  const { themeColor, setThemeColor, tenantDefault } = useThemeColor();
  const { user } = useAuth();
  const [selected, setSelected] = useState<ThemeColor>('default');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canSetDefault = hasPermission(user, 'settings.update');

  useEffect(() => {
    setSelected(themeColor);
  }, [themeColor]);

  useEffect(() => {
    apiGet('/settings/appearance')
      .then(() => {})
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handlePreview = (t: ThemeColor) => {
    setSelected(t);
    setThemeColor(t);
  };

  const handleSaveDefault = async () => {
    setSaving(true);
    try {
      const res = (await apiPut('/settings/appearance', { appearance_theme: selected })) as any;
      if (res.error) {
        toast.error(res.error.detail);
        return;
      }
      toast.success('Organization default theme saved — new users inherit it');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appearance"
        description="Pick a color theme. Your choice is personal; admins can also set the organization default."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            <Palette className="h-5 w-5 inline mr-2" />
            Color Theme
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {THEME_COLORS.map((t) => (
              <button
                key={t}
                onClick={() => handlePreview(t)}
                className={cn(
                  'rounded-lg border p-4 text-left transition-colors hover:bg-accent',
                  selected === t ? 'border-primary ring-2 ring-ring' : 'border-border'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('h-6 w-6 rounded-full', THEME_META[t].swatch)} />
                  {selected === t && <Check className="h-4 w-4 text-primary" />}
                </div>
                <p className="font-medium text-sm">{THEME_META[t].name}</p>
                <p className="text-xs text-muted-foreground">{THEME_META[t].desc}</p>
                {tenantDefault === t && (
                  <p className="text-xs text-muted-foreground mt-1">Organization default</p>
                )}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label>Live preview</Label>
            <div className="flex gap-2">
              <span className="inline-flex items-center rounded-md bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5">
                Primary button
              </span>
              <span className="inline-flex items-center rounded-md bg-secondary text-secondary-foreground text-xs font-medium px-3 py-1.5">
                Secondary
              </span>
              <span className="inline-flex items-center rounded-md bg-accent text-accent-foreground text-xs font-medium px-3 py-1.5">
                Accent
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Your pick applies instantly and is saved on this device. Light/dark mode is separate
              (navbar sun/moon toggle) and works with every theme.
            </p>
          </div>
          {canSetDefault && (
            <Button onClick={handleSaveDefault} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save as organization default'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
