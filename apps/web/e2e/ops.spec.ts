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

test.describe('PART C — backup & restore', () => {
  test('backup creates a real downloadable record; restore wizard stops before execute', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await login(page, 'admin@demo.com', 'admin123');
    await page.goto('/settings/backups');
    await expect(page.getByText('Backup & Restore').first()).toBeVisible({ timeout: 20000 });

    const before = ((await api(page, 'GET', '/backups')).body?.data || []).length;
    await page.getByRole('button', { name: 'Create Backup' }).first().click();
    // Wait for the history count to grow (creation is async server-side)
    let after = before;
    for (let i = 0; i < 40 && after <= before; i++) {
      await page.waitForTimeout(3000);
      await page.getByRole('button', { name: 'Refresh' }).click();
      after = ((await api(page, 'GET', '/backups')).body?.data || []).length;
    }
    console.log(`BACKUP before=${before} after=${after}`);
    expect(after).toBeGreaterThan(before);
    await page.screenshot({ path: 'apps/web/e2e/screenshots/backup-history.png' });

    // Download must be a real file, not just a toast: verify via API (status + size)
    const list = ((await api(page, 'GET', '/backups')).body?.data || []);
    const latest = list[0];
    const dl = await page.request.fetch(`http://localhost:3000/api/v1/backups/${latest.id}/download`, {
      headers: { Authorization: `Bearer ${await adminToken(page)}` },
    });
    const buf = await dl.body().catch(() => Buffer.alloc(0));
    console.log(`BACKUP_DOWNLOAD status=${dl.status()} bytes=${buf.length}`);
    expect(dl.status()).toBe(200);
    expect(buf.length).toBeGreaterThan(0);

    // Restore wizard: open validation ONLY (safe GET), then cancel. Never execute.
    const token = await adminToken(page);
    const v = await page.request.fetch(`http://localhost:3000/api/v1/backups/${latest.id}/validate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const vb: any = await v.json().catch(() => ({}));
    console.log(`BACKUP_VALIDATE status=${v.status()} valid=${vb?.data?.valid ?? vb?.valid}`);
    // Open the wizard in UI to screenshot it, then cancel without proceeding
    const rows = page.locator('table tbody tr');
    await rows.first().locator('button[title="Validate & Restore"]').click();
    await expect(page.getByText('Restore Wizard')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'apps/web/e2e/screenshots/backup-restore-wizard.png' });
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    expect(errs).toEqual([]);
  });
});

test.describe('PART D — activity log + sessions', () => {
  test('activity viewer shows real logged actions (producers now wired)', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await login(page, 'admin@demo.com', 'admin123');
    // This very login writes a LOGIN row — the viewer must show real data now
    // (previously asserted the honest empty state; producers exist since).
    await page.goto('/activity');
    await expect(page.locator('table').first()).toBeVisible({ timeout: 20000 });
    await expect(async () => {
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).toContain('LOGIN');
    }).toPass({ timeout: 15000 });
    const bodyText = await page.locator('body').innerText();
    console.log(`ACTIVITY_HAS_LOGIN=${bodyText.includes('LOGIN')} EMPTY_STATE=${bodyText.includes('No activity found')}`);
    expect(bodyText).not.toContain('No activity found');
    await page.screenshot({ path: 'apps/web/e2e/screenshots/activity-log.png' });
    expect(errs).toEqual([]);
  });

  test('sessions list shows real rows; UI terminate kills that token', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await login(page, 'admin@demo.com', 'admin123');
    const tokenA = await adminToken(page);

    const listOf = async (t: string) => {
      const r = await page.request.fetch('http://localhost:3000/api/v1/auth/sessions', {
        headers: { Authorization: `Bearer ${t}` },
      });
      const b: any = await r.json().catch(() => ({}));
      return Array.isArray(b?.data) ? b.data : [];
    };
    // NOTE: the list is capped at 50 rows and prior runs leave history behind,
    // so assert on id-SET differences, never absolute counts.
    const idsOf = async (t: string) => new Set((await listOf(t)).map((s: any) => String(s.id)));
    const beforeIds = await idsOf(tokenA);

    // Second session via API (deterministic target: the newly-appearing row)
    const second = await page.request.post('http://localhost:3000/api/v1/auth/login', {
      headers: { 'User-Agent': 'pw-terminate-target/1.0' },
      data: { email: 'admin@demo.com', password: 'admin123' },
    });
    const secondBody: any = await second.json();
    const tokenB: string = secondBody?.data?.accessToken;
    expect(tokenB).toBeTruthy();

    await page.goto('/profile');
    await page.waitForTimeout(3000);
    const sessionsTitle = page.getByText('Active Sessions').first();
    await sessionsTitle.scrollIntoViewIfNeeded();
    await expect(sessionsTitle).toBeVisible({ timeout: 20000 });
    const afterIds = await idsOf(tokenA);
    const newIds = [...afterIds].filter((id) => !beforeIds.has(id));
    console.log(`SESSIONS before=${beforeIds.size} after=${afterIds.size} new=${JSON.stringify(newIds)}`);
    expect(newIds.length).toBeGreaterThanOrEqual(1);
    const targetId = newIds[0];
    await page.screenshot({ path: 'apps/web/e2e/screenshots/sessions.png' });

    // Newest-first ordering puts the target row first — terminate it via UI
    const rows = page.locator('div.flex.items-center.justify-between.rounded-lg.border');
    await rows.first().getByRole('button', { name: 'Terminate' }).click();
    await expect(async () => {
      expect((await idsOf(tokenA)).has(targetId)).toBe(false);
    }).toPass({ timeout: 15000 });
    // tokenB must now be dead; browser session (tokenA) still alive
    const probeB = await page.request.fetch('http://localhost:3000/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    console.log(`SESSION_UI_TERMINATE tokenB=${probeB.status()}`);
    expect(probeB.status()).toBe(401);
    const probeA = await page.request.fetch('http://localhost:3000/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(probeA.status()).toBe(200);
    expect(errs).toEqual([]);
  });
});
