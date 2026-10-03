/**
 * Foundation oracle: the signed-in layout shell is behind authGuard.
 * Hermetic — static SPA, hash routing, every /api/** call mocked here.
 */
import { test, expect, type Page } from '@playwright/test';

async function mockApi(page: Page): Promise<void> {
  const store: { user: { id: string; email: string; role: string } | null } = { user: null };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname
      .replace(/^.*\/api\//, '').replace(/^api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') {
      store.user = { id: '1', email: 'user@example.com', role: 'USER' };
      return json(store.user);
    }
    if (method === 'GET' && apiPath === 'users/me') {
      return store.user ? json(store.user) : json({ message: 'Unauthorized' }, 401);
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await mockApi(page); });

test('signed-out visitor opening /#/dashboard lands on sign-in with returnUrl and no sidebar', async ({ page }) => {
  await page.goto('/#/dashboard');
  await expect(page).toHaveURL(/#\/login\?returnUrl=%2Fdashboard/, { timeout: 10_000 });
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('aside.sidebar')).toHaveCount(0);
});

test('signing in from the guarded redirect returns to the dashboard', async ({ page }) => {
  await page.goto('/#/dashboard');
  await expect(page).toHaveURL(/#\/login\?returnUrl=%2Fdashboard/, { timeout: 10_000 });
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
  await expect(page.locator('aside.sidebar')).toBeVisible();
});

test('signed-in user opening /#/dashboard sees the dashboard shell', async ({ page }) => {
  await page.goto('/#/login');
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
  await page.goto('/#/dashboard');
  await expect(page.locator('aside.sidebar')).toBeVisible();
  expect(page.url()).not.toMatch(/#\/login/);
});
