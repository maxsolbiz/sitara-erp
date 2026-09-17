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
      <head>
        {/* Pre-paint theme-color restore (FOUC guard). SECURITY: this must
            stay a fixed literal string — never interpolate server data or
            user input here. It only reads the personal localStorage choice;
            the tenant default loads client-side after hydration (accepted
            v1 tradeoff: first-load flash for users without a personal
            choice when tenant default != default). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sitara-theme-color');if(t==='emerald'||t==='amber'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
