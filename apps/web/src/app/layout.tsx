import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'Sitara ERP', template: '%s | Sitara ERP' },
  description: 'Sitara ERP — Business Management System',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Sitara ERP' },
  // Next 14's Viewport type has no mobileWebAppCapable field, so emit the
  // standard tag directly. Chrome deprecates the Apple-only variant and
  // requires this alongside it (fixes console warning on /settings, /pos).
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
