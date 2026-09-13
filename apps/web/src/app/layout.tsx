import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'Sitara ERP', template: '%s | Sitara ERP' },
  description: 'Sitara ERP — Business Management System',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
  manifest: '/manifest.json',
  themeColor: '#0f172a',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Sitara ERP' },
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
