import { Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Cold Next.js dev compiles can exceed 20s on first hit — allow 90s.
  await page.waitForURL('**/dashboard', { timeout: 90000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}

export async function consoleErrors(page: Page): Promise<string[]> {
  const errs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 200)));
  return errs;
}
