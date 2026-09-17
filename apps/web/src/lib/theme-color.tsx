'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

export const THEME_COLORS = ['default', 'emerald', 'amber'] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

const STORAGE_KEY = 'sitara-theme-color';

interface ThemeColorCtx {
  themeColor: ThemeColor;
  setThemeColor: (t: ThemeColor) => void;
  tenantDefault: ThemeColor | null;
}

const Ctx = createContext<ThemeColorCtx>({ themeColor: 'default', setThemeColor: () => {}, tenantDefault: null });

function isValid(t: string | null): t is ThemeColor {
  return t === 'default' || t === 'emerald' || t === 'amber';
}

function readStored(): ThemeColor | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isValid(v) ? v : null;
  } catch {
    return null;
  }
}

function applyToDom(t: ThemeColor) {
  const root = document.documentElement;
  if (t === 'default') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

export function ThemeColorProvider({ children }: { children: React.ReactNode }) {
  const [themeColor, setThemeColorState] = useState<ThemeColor>('default');
  const [tenantDefault, setTenantDefault] = useState<ThemeColor | null>(null);

  // Initial paint: personal localStorage wins; else fall back to tenant
  // appearance_theme; else default. The blocking script in layout <head>
  // already applied the localStorage value pre-paint to avoid FOUC — this
  // effect reconciles React state and fetches the tenant default lazily.
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setThemeColorState(stored);
      applyToDom(stored);
    }
    apiGet('/settings/appearance')
      .then((res: any) => {
        const t = res?.data?.appearance_theme;
        if (isValid(t)) {
          setTenantDefault(t);
          if (!stored) {
            setThemeColorState(t);
            applyToDom(t);
          }
        }
      })
      .catch(() => {});
  }, []);

  const setThemeColor = useCallback((t: ThemeColor) => {
    setThemeColorState(t);
    applyToDom(t);
    try {
      if (t === 'default') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  }, []);

  return <Ctx.Provider value={{ themeColor, setThemeColor, tenantDefault }}>{children}</Ctx.Provider>;
}

export function useThemeColor() {
  return useContext(Ctx);
}
