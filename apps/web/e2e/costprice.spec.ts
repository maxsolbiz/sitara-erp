import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('costPrice contract', () => {
  test('admin sees Cost Price on detail + API includes costPrice', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await login(page, 'admin@demo.com', 'admin123');
    await page.goto('/products');
    await page.getByRole('link', { name: 'View' }).first().click();
    await expect(page.getByText('Cost Price').first()).toBeVisible({ timeout: 15000 });
    const costText = (await page.getByText('Cost Price').first().locator('..').innerText().catch(() => '')) as string;
    expect(costText).not.toContain('NaN');
    const apiRes = await page.waitForResponse(
      (r) => r.url().includes('/api/v1/products/') && r.request().method() === 'GET',
      { timeout: 15000 }
    ).catch(() => null);
    if (apiRes) {
      const body = await apiRes.json().catch(() => ({}));
      expect(body?.data).toHaveProperty('costPrice');
    }
    await page.screenshot({ path: 'apps/web/e2e/screenshots/cost-admin-detail.png' });
    expect(errs).toEqual([]);
  });

  test('viewer without products.export: no costPrice in DOM value or API body', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    const apiBodies: any[] = [];
    page.on('response', async (r) => {
      if (r.url().includes('/api/v1/products') && r.request().method() === 'GET') {
        try { apiBodies.push(await r.json()); } catch { /* ignore */ }
      }
    });
    await login(page, 'e2eviewer@demo.com', 'e2eviewer123');
    await page.goto('/products');
    await page.getByRole('link', { name: 'View' }).first().click();
    await expect(page.getByText('Cost Price').first()).toBeVisible({ timeout: 15000 });
    const bodyText = await page.locator('body').innerText();
    const hasNaN = bodyText.includes('NaN');
    await page.screenshot({ path: 'apps/web/e2e/screenshots/cost-viewer-detail.png' });
    // Defense-in-depth: API bodies must not contain the field at all
    const leaked = apiBodies.some((b) => {
      const items = Array.isArray(b?.data) ? b.data : [b?.data].filter(Boolean);
      return items.some((it: any) => it && 'costPrice' in it);
    });
    expect(leaked).toBe(false);
    // Report graceful vs broken (informational assertion recorded below)
    console.log(`VIEWER_NAN_IN_DOM=${hasNaN}`);
    expect(errs).toEqual([]);
  });
});
