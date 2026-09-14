// Sitara ERP — PM2 ecosystem for bare-metal VPS deploy.
// Follows the existing on-box convention (cf. /root/club-mgt/ecosystem.config.js):
// fork mode, autorestart, file logs. Secrets live in /root/sitara/.env
// (chmod 600, created manually — NEVER committed), not in this file.
// Ports: 3103 (api) + 3104 (web) bound to 127.0.0.1 only; Apache is the
// sole public layer. These ports were verified free on 2026-09-14
// (taken: 3000, 3001, 3002, 3101, 3102, 5000).
module.exports = {
  apps: [
    {
      name: 'sitara-api',
      cwd: '/root/sitara',
      script: 'apps/api/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: '3103',
      },
      error_file: '/var/log/sitara/api-error.log',
      out_file: '/var/log/sitara/api-out.log',
    },
    {
      name: 'sitara-worker',
      cwd: '/root/sitara',
      script: 'apps/api/dist/worker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/sitara/worker-error.log',
      out_file: '/var/log/sitara/worker-out.log',
    },
    {
      name: 'sitara-web',
      cwd: '/root/sitara/apps/web',
      // NOTE: npm workspaces hoist next to the repo root — NOT apps/web/node_modules.
      script: '/root/sitara/node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 3104',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: '3104',
      },
      error_file: '/var/log/sitara/web-error.log',
      out_file: '/var/log/sitara/web-out.log',
    },
  ],
};
