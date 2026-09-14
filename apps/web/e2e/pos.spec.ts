import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('POS walk-in + core flow', () => {
  test('walk-in cash sale completes with receipt', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await login(page, 'e2eviewer@demo.com', 'e2eviewer123');
    await page.goto('/pos');
    // Product grid loads
    await expect(page.getByPlaceholder('Scan barcode or search... (F1)')).toBeVisible({ timeout: 20000 });
    // Add first available product via grid button
    const gridBtn = page.locator('div.grid button:not([disabled])').first();
    await expect(gridBtn).toBeVisible({ timeout: 15000 });
    const prodName = (await gridBtn.innerText()).split('\n')[1];
    await gridBtn.click();
    // Cart updates async — poll instead of asserting a single instant
    await expect(async () => {
      expect(await page.getByText('Cart is empty').count()).toBe(0);
    }).toPass({ timeout: 10000 });
    await page.screenshot({ path: 'apps/web/e2e/screenshots/pos-cart.png' });
    // Walk-in should be preselected (green customer badge shows fullName)
    await expect(page.getByText('Walk-in Customer').first()).toBeVisible({ timeout: 10000 });
    // Checkout
    await page.getByRole('button', { name: /Checkout/ }).click();
    await expect(page.getByRole('heading', { name: 'Complete Sale' })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'apps/web/e2e/screenshots/pos-payment.png' });
    // Pay exact-ish large amount to cover total (CASH default, blank = full total path)
    await page.getByRole('button', { name: /Complete Sale/ }).last().click();
    await expect(page.getByText('Sale Complete!')).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: 'apps/web/e2e/screenshots/pos-confirmation.png' });
    console.log(`POS_SALE_PRODUCT=${prodName}`);
    expect(errs).toEqual([]);
  });

  test('empty cart blocks checkout', async ({ page }) => {
    await login(page, 'e2eviewer@demo.com', 'e2eviewer123');
    await page.goto('/pos');
    await expect(page.getByPlaceholder('Scan barcode or search... (F1)')).toBeVisible({ timeout: 20000 });
    const checkout = page.getByRole('button', { name: /Checkout/ });
    await expect(checkout).toBeDisabled({ timeout: 10000 });
    await page.screenshot({ path: 'apps/web/e2e/screenshots/pos-empty-cart.png' });
  });

  test('overstock quantity is capped at stock with error toast', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await login(page, 'e2eviewer@demo.com', 'e2eviewer123');
    await page.goto('/pos');
    await expect(page.getByPlaceholder('Scan barcode or search... (F1)')).toBeVisible({ timeout: 20000 });
    // Pick a product with enough stock to hammer the + button (skip depleted ones;
    // repeated suite runs consume demo stock, so the first grid item may be at 0)
    const gridButtons = page.locator('div.grid button:not([disabled])');
    const n = await gridButtons.count();
    let picked = -1;
    let badgeStock = 0;
    let prodName = '';
    for (let i = 0; i < n; i++) {
      const t = ((await gridButtons.nth(i).innerText()).split('\n') || []).map((s) => s.trim());
      const badge = parseInt(t[t.length - 1] || '', 10);
      if (Number.isFinite(badge) && badge >= 20) {
        picked = i;
        badgeStock = badge;
        prodName = t[1] || '';
        break;
      }
    }
    if (picked < 0) throw new Error('no product with stock >= 20 for overstock test');
    const gridBtn = gridButtons.nth(picked);
    await gridBtn.click();
    // Scope + to the cart row (header also has a Plus icon — do not match it)
    const row = page.locator('div.flex.items-center.gap-2.rounded-lg.border', { hasText: prodName.slice(0, 20) });
    const plus = row.locator('button').nth(1);
    for (let i = 0; i < 60; i++) await plus.click();
    const qtyText = await row.locator('span.w-7').innerText();
    const qty = parseInt(qtyText.trim(), 10);
    await page.screenshot({ path: 'apps/web/e2e/screenshots/pos-overstock.png' });
    console.log(`OVERSTOCK badgeStock=${badgeStock} qtyAfterHammer=${qty}`);
    // Qty must be capped at available stock, never exceed it
    expect(qty).toBeLessThanOrEqual(badgeStock);
    // A toast must have announced the cap
    await expect(page.locator('.sonner, [data-sonner-toast]').filter({ hasText: /Only .* in stock/ }).first()).toBeVisible({ timeout: 5000 });
    expect(errs).toEqual([]);
  });
});
