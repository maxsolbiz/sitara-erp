import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'apps/web/e2e',
  timeout: 90000,
  retries: 0,
  // REQUIRED: always run with --workers=1. Parallel workers racing the
  // on-demand Next.js dev compiler cause timing flakes (login timeouts,
  // response-listener races) that look like app bugs but aren't.
  // e.g.: npx playwright test --config playwright.config.ts --workers=1
  workers: 1,
  use: {
    baseURL: 'http://localhost:3001',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  outputDir: 'apps/web/e2e/test-results',
});
