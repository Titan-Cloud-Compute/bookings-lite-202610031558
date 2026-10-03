/**
 * Story: create-service — a provider (MANAGER) creates a service and sees it
 * in "My services". Hermetic: static SPA, hash routing, /api/** mocked here.
 */
import { test, expect, type Page } from '@playwright/test';

interface Svc {
  id: string; providerId: string; name: string; durationMinutes: number;
  priceCents: number; active: boolean; createdAt: string; updatedAt: string;
}

async function mockApi(page: Page, role: 'MANAGER' | 'USER'): Promise<{ posts: unknown[] }> {
  const user = { id: 'prov1', email: 'manager@example.com', name: 'Provider', role };
  let signedIn = false;
  const services: Svc[] = [];
  const posts: unknown[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname
      .replace(/^.*\/api\//, '').replace(/^api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') { signedIn = true; return json(user); }
    if (method === 'GET' && apiPath === 'users/me') {
      return signedIn ? json(user) : json({ message: 'Unauthorized' }, 401);
    }
    if (apiPath === 'services/mine' && method === 'GET') {
      if (role !== 'MANAGER') return json({ message: 'Forbidden' }, 403);
      return json(services.filter((s) => s.providerId === user.id));
    }
    if (apiPath === 'services' && method === 'GET') return json(services.filter((s) => s.active));
    if (apiPath === 'services' && method === 'POST') {
      if (role !== 'MANAGER') return json({ message: 'Forbidden' }, 403);
      const body = req.postDataJSON() as { name: string; durationMinutes: number; priceCents: number };
      posts.push(body);
      const now = new Date().toISOString();
      const svc: Svc = { id: `s${services.length + 1}`, providerId: user.id, active: true, createdAt: now, updatedAt: now, ...body };
      services.push(svc);
      return json(svc, 201);
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
  return { posts };
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill('manager@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/#\/login/, { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('signed-out visitor opening /#/services is sent to sign-in', async ({ page }) => {
  await mockApi(page, 'MANAGER');
  await page.goto('/#/services');
  await expect(page).toHaveURL(/#\/login\?returnUrl=%2Fservices/, { timeout: 10_000 });
});

test('provider creates a service and it appears in "My services"', async ({ page }) => {
  const { posts } = await mockApi(page, 'MANAGER');
  await signIn(page);
  await page.goto('/#/services');
  await expect(page.locator('aside.sidebar')).toBeVisible();
  const form = page.locator('[data-testid="service-form"]');
  await expect(form.locator('#service-name')).toBeVisible();
  await expect(page.locator('[data-testid="service-list"]')).toBeVisible();
  await expect(page.getByText('Your content will appear here.')).toHaveCount(0);

  await page.locator('#service-name').fill('Haircut');
  await page.locator('#service-duration').fill('45');
  await page.locator('#service-price').fill('25.50');
  await page.locator('[data-testid="service-submit"]').click();

  const item = page.locator('[data-testid="service-list"] [data-testid="service-item"]');
  await expect(item).toHaveCount(1, { timeout: 10_000 });
  await expect(item).toContainText('Haircut');
  await expect(item).toContainText('45 min');
  await expect(item).toContainText('25.50');
  expect(posts).toEqual([{ name: 'Haircut', durationMinutes: 45, priceCents: 2550 }]);
});

test('invalid input is rejected client-side without a request', async ({ page }) => {
  const { posts } = await mockApi(page, 'MANAGER');
  await signIn(page);
  await page.goto('/#/services');
  await page.locator('#service-duration').fill('30');
  await page.locator('#service-price').fill('10');
  await page.locator('[data-testid="service-submit"]').click();
  await expect(page.locator('[data-testid="service-error"]')).toBeVisible();
  expect(posts).toEqual([]);
});
