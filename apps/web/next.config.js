/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  buildExcludes: [/middleware-manifest\.json$/],
  // NOTE: no runtimeCaching for /api/* — those endpoints require
  // Authorization and are user/tenant-specific. Caching them in the
  // service worker would store 401s or leak one user's data to another.
  // Offline support is handled via IndexedDB (lib/offline-db.ts) instead.
  runtimeCaching: [],
});

const nextConfig = {
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  images: {
    domains: [process.env.NEXT_PUBLIC_API_URL?.replace('https://', '').split('/')[0] || 'localhost'],
  },
  async rewrites() {
    // Uploaded files (product images, logos) are stored and served by the
    // API via express.static — the web app has no /uploads route, so proxy
    // them there. (Serving via Apache Alias is not possible: the files live
    // under /root, which the www-data user cannot traverse.)
    const apiHost = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1').replace(/\/api\/v1$/, '');
    return [
      { source: '/favicon.ico', destination: '/favicon.svg' },
      { source: '/uploads/:path*', destination: `${apiHost}/uploads/:path*` },
      { source: '/api/v1/:path*', destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'}/:path*` },
      { source: '/api/:path*', destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'}/:path*` },
    ];
  },
};

module.exports = withPWA(nextConfig);
