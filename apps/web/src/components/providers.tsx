'use client';

import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/lib/auth';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <AuthProvider>
        {children}
        <Toaster richColors closeButton />
      </AuthProvider>
    </ThemeProvider>
  );
}
