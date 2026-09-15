import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('reset-password Suspense boundary guard', () => {
  test('page renders without client-side exception when Suspense boundary is present', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => {
      console.log('PAGE ERROR:', e.message);
    });

    // Navigate directly to the reset-password page with a bogus token
    // This exercises the same SSR/CSR path that useSearchParams() needs Suspense for
    await page.goto('http://localhost:3001/reset-password?token=bogus-token-for-test', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // The page should render without a client-side exception
    // If Suspense is missing, Next.js will throw "useSearchParams() should be wrapped in a suspense boundary"
    const errorText = page.locator('text=useSearchParams() should be wrapped in a suspense boundary');
    await expect(errorText).not.toBeVisible({ timeout: 5000 });

    // The page should render either the reset form or the "invalid token" state
  // Either is fine - we just need to verify no client-side error about Suspense
  const errorOverlay = await page.locator('[data-nextjs-error-overlay]').isVisible().catch(() => false);
  expect(errorOverlay).toBe(false);

  // At least one of the expected UI elements should be present

    // At least one of the expected UI elements should be present
    const hasContent = await page.locator('text=Set New Password').or(page.locator('text=Invalid')).or(page.locator('text=expired')).or(page.locator('text=Invalid')).isVisible().catch(() => false);
    expect(hasContent).toBe(true);
  });
});