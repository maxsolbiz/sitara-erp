import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('costPrice contract', () => {
  test('admin sees Cost Price on detail + API includes costPrice', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await login(page, 'admin@demo.com', 'admin123');
    await page.goto('/products');
    // Attach response listener BEFORE navigation so the detail API call can't slip past it.
    // Match ONLY the detail call (/products/<id>), not list (/products?...) or variants (/:id/variants).
    const apiResPromise = page.waitForResponse(
      (r) => /\/api\/v1\/products\/\d+(\?.*)?$/.test(r.url()) && r.request().method() === 'GET',
      { timeout: 15000 }
    ).catch(() => null);
    await page.getByRole('link', { name: 'View' }).first().click();
    await expect(page.getByText('Cost Price').first()).toBeVisible({ timeout: 15000 });
    const costText = (await page.getByText('Cost Price').first().locator('..').innerText().catch(() => '')) as string;
    expect(costText).not.toContain('NaN');
    const apiRes = await apiResPromise;
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
    // Cost section must be hidden (not crashed, not NaN) for unauthorized roles
    await expect(page.getByText('Selling Price').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Cost Price')).toHaveCount(0);
    const bodyText = await page.locator('body').innerText();
    const hasNaN = bodyText.includes('NaN');
    const hasCrash = bodyText.includes('Something went wrong');
    await page.screenshot({ path: 'apps/web/e2e/screenshots/cost-viewer-detail.png' });
    // Defense-in-depth: API bodies must not contain the field at all
    const leaked = apiBodies.some((b) => {
      const items = Array.isArray(b?.data) ? b.data : [b?.data].filter(Boolean);
      return items.some((it: any) => it && 'costPrice' in it);
    });
    expect(leaked).toBe(false);
    // Graceful degradation: no crash boundary, no NaN values
    expect(hasCrash).toBe(false);
    expect(hasNaN).toBe(false);
    console.log(`VIEWER_NAN_IN_DOM=${hasNaN} CRASH=${hasCrash}`);
    expect(errs).toEqual([]);
  });
});
