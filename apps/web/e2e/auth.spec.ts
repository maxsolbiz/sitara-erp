import { test, expect } from '@playwright/test';
import { login } from './helpers';

async function adminToken(page: any): Promise<string> {
  // Reads can race app-driven navigations (e.g. the force-password redirect)
  // — retry a few times instead of failing on a transient destroyed context.
  let lastErr: any = null;
  for (let i = 0; i < 10; i++) {
    try {
      return await page.evaluate(() => localStorage.getItem('accessToken'));
    } catch (e) {
      lastErr = e;
      await page.waitForTimeout(500);
    }
  }
  throw lastErr;
}

async function api(page: any, method: string, path: string, body?: any, token?: string) {
  const t = token || (await adminToken(page));
  const res = await page.request.fetch(`http://localhost:3000/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    data: body,
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

test.describe('forced password change (UI)', () => {
  test.afterEach(async ({ page }) => {
    // Restore the viewer fixture even if the test body threw mid-flow
    // (e.g. after the temp-password change but before the inline restore).
    // Admin PATCH resets the hash but sets must_change_password, so the
    // flag is cleared via viewer self-change, mirroring the test body.
    await login(page, 'admin@demo.com', 'admin123');
    // Retry: bursts of dashboard polling can trip the 60s rate-limit
    // window; a failed lookup must fail loudly, never silently skip.
    let viewer: any = null;
    for (let i = 0; i < 8 && !viewer; i++) {
      const usersList: any = await api(page, 'GET', '/users');
      viewer = ((usersList.body?.data || []) as any[]).find((u: any) => u.email === 'e2eviewer@demo.com');
      if (!viewer) await page.waitForTimeout(10000);
    }
    if (!viewer) throw new Error('afterEach: e2eviewer user missing, cannot restore');
    for (let i = 0; i < 8; i++) {
      const r: any = await api(page, 'PATCH', `/users/${viewer.id}/password`, { password: 'e2eviewer123' });
      if (r.status === 200) break;
      if (i === 7) throw new Error('afterEach: admin PATCH failed with status ' + r.status);
      await page.waitForTimeout(10000);
    }
    await page.evaluate(() => { localStorage.clear(); });
    await page.goto('/login');
    await page.locator('#email').fill('e2eviewer@demo.com');
    await page.locator('#password').fill('e2eviewer123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    const forced = await page.waitForURL('**/force-password', { timeout: 30000 }).then(() => true).catch(() => false);
    if (forced) {
      await expect(page.getByText('Set a New Password')).toBeVisible({ timeout: 15000 });
      await page.locator('#current').fill('e2eviewer123');
      await page.locator('#password').fill('e2eviewer123');
      await page.locator('#confirm').fill('e2eviewer123');
      await page.getByRole('button', { name: 'Set Password & Continue' }).click();
      await page.waitForURL('**/dashboard', { timeout: 90000 });
    } else {
      await page.waitForURL('**/dashboard', { timeout: 90000 });
    }
  });

  test('flagged user is routed to force-password, changes, regains access', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    // Admin forces e2eviewer into must-change via admin password reset
    await login(page, 'admin@demo.com', 'admin123');
    const usersList: any = await api(page, 'GET', '/users');
    const viewer = ((usersList.body?.data || []) as any[]).find((u: any) => u.username === 'e2eviewer' || u.email === 'e2eviewer@demo.com');
    if (!viewer) throw new Error('e2eviewer user missing');
    await api(page, 'PATCH', `/users/${viewer.id}/password`, { password: 'TempForce123' });
    // Fresh browser state as the viewer
    await page.evaluate(() => { localStorage.clear(); });
    await page.goto('/login');
    await page.locator('#email').fill('e2eviewer@demo.com');
    await page.locator('#password').fill('TempForce123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard', { timeout: 90000 });
    // Any real data fetch trips the gate → redirect to force-password
    await page.waitForURL('**/force-password', { timeout: 30000 });
    await expect(page.getByText('Set a New Password')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'apps/web/e2e/screenshots/force-password.png' });
    await page.locator('#current').fill('TempForce123');
    await page.locator('#password').fill('ViewerNew123');
    await page.locator('#confirm').fill('ViewerNew123');
    await page.getByRole('button', { name: 'Set Password & Continue' }).click();
    await page.waitForURL('**/dashboard', { timeout: 90000 });
    await expect(page.locator('body')).toContainText('Dashboard', { timeout: 20000 });
    console.log('FORCE_FLOW dashboard-regained=true');
    // Restore viewer to clean state: admin reset + viewer self-change clears the flag
    await login(page, 'admin@demo.com', 'admin123');
    await api(page, 'PATCH', `/users/${viewer.id}/password`, { password: 'e2eviewer123' });
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => { localStorage.clear(); }).catch(() => {});
    await page.reload();
    await page.locator('#email').fill('e2eviewer@demo.com');
    await page.locator('#password').fill('e2eviewer123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard', { timeout: 90000 });
    const vTok = await adminToken(page);
    const vRes = await page.request.fetch('http://localhost:3000/api/v1/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vTok}` },
      data: { currentPassword: 'e2eviewer123', newPassword: 'e2eviewer123' },
    });
    expect(vRes.status()).toBe(200);
    expect(errs).toEqual([]);
  });
});

test.describe('forgot password (UI)', () => {
  test('forgot form submits; reset with bogus token shows error', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await page.goto('/forgot-password');
    await page.locator('#email').fill('admin@demo.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(page.getByText(/reset link has been sent/i)).toBeVisible({ timeout: 15000 });
    await page.goto('/reset-password?token=bogus-token-xyz');
    await page.locator('#password').fill('Newpass123');
    await page.locator('#confirm').fill('Newpass123');
    await page.getByRole('button', { name: 'Set Password' }).click();
    await expect(page.getByText(/invalid or expired/i)).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'apps/web/e2e/screenshots/reset-invalid.png' });
    expect(errs).toEqual([]);
  });
});
