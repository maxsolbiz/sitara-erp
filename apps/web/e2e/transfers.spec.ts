import { test, expect } from '@playwright/test';
import { login } from './helpers';

async function adminToken(page: any): Promise<string> {
  return await page.evaluate(() => localStorage.getItem('accessToken'));
}

async function api(page: any, method: string, path: string, body?: any) {
  const token = await adminToken(page);
  const res = await page.request.fetch(`http://localhost:3000/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    data: body,
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

test.describe('PART B — stock transfers', () => {
  test('transfer moves stock exactly + overstock rejected', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await login(page, 'admin@demo.com', 'admin123');

    // Ensure a second warehouse exists (test setup, via API)
    let whs = (await api(page, 'GET', '/inventory/warehouses')).body?.data || [];
    let dest = whs.find((w: any) => w.name === 'E2E Branch');
    if (!dest) {
      const r = await api(page, 'POST', '/inventory/warehouses', { name: 'E2E Branch', code: 'E2E-BR' });
      if (r.status !== 200 && r.status !== 201) throw new Error('cannot create branch warehouse: ' + r.status);
      whs = (await api(page, 'GET', '/inventory/warehouses')).body?.data || [];
      dest = whs.find((w: any) => w.name === 'E2E Branch');
    }
    const src = whs.find((w: any) => w.name !== 'E2E Branch');
    console.log(`TRANSFER_WH src=${src.name}(${src.id}) dest=${dest.name}(${dest.id})`);

    // Pick a stocked product in source warehouse
    const stockRes = await api(page, 'GET', `/inventory/stock?warehouseId=${src.id}`);
    const stocked = (stockRes.body?.data || []).find((s: any) => (s.quantity || 0) > 5);
    if (!stocked) throw new Error('no stocked product in source warehouse');
    const prodId = stocked.productId || stocked.product?.id;
    const beforeSrc = stocked.quantity;
    const destRow = ((await api(page, 'GET', `/inventory/stock?warehouseId=${dest.id}`)).body?.data || [])
      .find((s: any) => String(s.productId) === String(prodId) || String(s.product?.id) === String(prodId));
    const beforeDest = destRow?.quantity || 0;
    console.log(`TRANSFER_PROD id=${prodId} srcBefore=${beforeSrc} destBefore=${beforeDest}`);

    // UI flow
    await page.goto('/inventory/transfers');
    await expect(page.getByText('Stock Transfers').first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'New Transfer' }).click();
    await expect(page.getByText('New Stock Transfer')).toBeVisible({ timeout: 10000 });
    const selects = page.locator('select');
    await selects.nth(0).selectOption({ label: src.name });
    await selects.nth(1).selectOption({ label: dest.name });
    await page.getByPlaceholder('Search products...').fill(stocked.productName || stocked.product?.name || 'Bag');
    await page.waitForTimeout(800);
    const result = page.locator('div.absolute button').first();
    await expect(result).toBeVisible({ timeout: 10000 });
    await result.click();
    await page.screenshot({ path: 'apps/web/e2e/screenshots/transfer-form.png' });
    await page.getByRole('button', { name: 'Transfer Stock' }).click();
    await expect(page.getByText(/completed|moved/i).first()).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: 'apps/web/e2e/screenshots/transfer-done.png' });

    // Verify exact movement via API
    const afterSrcRows = ((await api(page, 'GET', `/inventory/stock?warehouseId=${src.id}`)).body?.data || []);
    const afterSrc = afterSrcRows.find((s: any) => String(s.productId) === String(prodId) || String(s.product?.id) === String(prodId))?.quantity;
    const afterDestRows = ((await api(page, 'GET', `/inventory/stock?warehouseId=${dest.id}`)).body?.data || []);
    const afterDest = afterDestRows.find((s: any) => String(s.productId) === String(prodId) || String(s.product?.id) === String(prodId))?.quantity;
    console.log(`TRANSFER_AFTER src=${afterSrc} dest=${afterDest}`);
    expect(afterSrc).toBe(beforeSrc - 1);
    expect(afterDest).toBe(beforeDest + 1);

    // Negative: overstock via API must 400/500, never silently succeed
    const bad = await api(page, 'POST', '/inventory/transfers', {
      fromWarehouseId: Number(src.id), toWarehouseId: Number(dest.id),
      items: [{ productId: Number(prodId), quantity: 999999 }],
    });
    console.log(`TRANSFER_OVERSTOCK status=${bad.status}`);
    expect([400, 500]).toContain(bad.status);
    expect(errs).toEqual([]);
  });
});
