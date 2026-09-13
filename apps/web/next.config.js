/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    {
      urlPattern: /^\/api\/products/,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'api-products', expiration: { maxEntries: 500, maxAgeSeconds: 86400 } },
    },
    {
      urlPattern: /^\/api\/customers/,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'api-customers', expiration: { maxEntries: 1000, maxAgeSeconds: 86400 } },
    },
    {
      urlPattern: /^\/api\/settings/,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'api-settings', expiration: { maxEntries: 10, maxAgeSeconds: 604800 } },
    },
  ],
});

const nextConfig = {
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  images: {
    domains: [process.env.NEXT_PUBLIC_API_URL?.replace('https://', '').split('/')[0] || 'localhost'],
  },
  async rewrites() {
    return [
      { source: '/favicon.ico', destination: '/favicon.svg' },
      { source: '/api/v1/:path*', destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'}/:path*` },
      { source: '/api/:path*', destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'}/:path*` },
    ];
  },
};

module.exports = withPWA(nextConfig);
