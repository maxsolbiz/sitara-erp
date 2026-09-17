'use client';

import { ThemeProvider } from 'next-themes';
import { ThemeColorProvider } from '@/lib/theme-color';
import { AuthProvider } from '@/lib/auth';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <ThemeColorProvider>
      <AuthProvider>
        {children}
        <Toaster richColors closeButton />
      </AuthProvider>
      </ThemeColorProvider>
    </ThemeProvider>
  );
}
