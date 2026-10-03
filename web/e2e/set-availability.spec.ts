/**
 * Story: set-availability — a provider (MANAGER) sets weekly hours, blocks a
 * slot, and the bookable-slot preview only offers in-window, unblocked slots.
 * Hermetic: static SPA, hash routing, /api/** mocked here (slot generation
 * uses the real shared contract).
 */
import { test, expect, type Page } from '@playwright/test';
import {
  generateSlots,
  type AvailabilityWindowDto,
  type AvailabilityWindowInput,
  type BlockedSlotDto,
} from '../src/shared/contracts/availability';

// 2026-10-05 is a Monday.
const MONDAY = '2026-10-05';

interface Captured { puts: unknown[]; blockPosts: unknown[]; deletes: string[] }

async function mockApi(page: Page): Promise<Captured> {
  const user = { id: 'prov1', email: 'manager@example.com', name: 'Provider', role: 'MANAGER' };
  let signedIn = false;
  let n = 0;
  let windows: AvailabilityWindowDto[] = [];
  let blocks: BlockedSlotDto[] = [];
  const services = [{
    id: 'svc1', providerId: 'prov1', name: 'Haircut', durationMinutes: 30, priceCents: 2500,
    active: true, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  }];
  const captured: Captured = { puts: [], blockPosts: [], deletes: [] };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const url = new URL(req.url());
    const apiPath = url.pathname.replace(/^.*\/api\//, '').replace(/^api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') { signedIn = true; return json(user); }
    if (method === 'GET' && apiPath === 'users/me') {
      return signedIn ? json(user) : json({ message: 'Unauthorized' }, 401);
    }
    if (apiPath === 'services/mine' && method === 'GET') return json(services);
    if (apiPath === 'availability/windows' && method === 'GET') return json(windows);
    if (apiPath === 'availability/windows' && method === 'PUT') {
      const body = req.postDataJSON() as { windows: AvailabilityWindowInput[] };
      captured.puts.push(body);
      windows = body.windows.map((w) => ({ id: `w${++n}`, ...w }));
      return json(windows);
    }
    if (apiPath === 'availability/blocks' && method === 'GET') return json(blocks);
    if (apiPath === 'availability/blocks' && method === 'POST') {
      const body = req.postDataJSON() as { startsAt: string; endsAt: string };
      captured.blockPosts.push(body);
      const b = { id: `b${++n}`, ...body };
      blocks.push(b);
      return json(b, 201);
    }
    if (apiPath.startsWith('availability/blocks/') && method === 'DELETE') {
      const id = decodeURIComponent(apiPath.slice('availability/blocks/'.length));
      captured.deletes.push(id);
      blocks = blocks.filter((b) => b.id !== id);
      return json({ ok: true });
    }
    if (apiPath === 'availability/slots' && method === 'GET') {
      const svc = services.find((s) => s.id === url.searchParams.get('serviceId'));
      if (!svc) return json({ message: 'Not found' }, 404);
      return json(generateSlots(windows, blocks, url.searchParams.get('date') ?? '', svc.durationMinutes));
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
  return captured;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill('manager@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/#\/login/, { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('signed-out visitor opening /#/availability is sent to sign-in', async ({ page }) => {
  await mockApi(page);
  await page.goto('/#/availability');
  await expect(page).toHaveURL(/#\/login\?returnUrl=%2Favailability/, { timeout: 10_000 });
});

test('provider sets Monday 09:00-12:00, blocks 10:00-10:30, and only valid slots are offered', async ({ page }) => {
  const captured = await mockApi(page);
  await signIn(page);
  await page.goto('/#/availability');
  await expect(page.locator('aside.sidebar')).toBeVisible();
  await expect(page.locator('h1')).toContainText('Availability');
  await expect(page.getByText('Your content will appear here.')).toHaveCount(0);

  const days = page.locator('[data-testid="availability-week"] [data-testid="availability-day"]');
  await expect(days).toHaveCount(7);
  const monday = page.locator('[data-testid="availability-day"][data-day="1"]');
  await monday.locator('[data-testid="day-enabled"]').check();
  await monday.locator('[data-testid="day-start"]').fill('09:00');
  await monday.locator('[data-testid="day-end"]').fill('12:00');
  await page.locator('[data-testid="week-save"]').click();
  await expect(page.locator('[data-testid="week-saved"]')).toBeVisible({ timeout: 10_000 });
  expect(captured.puts).toEqual([{ windows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }] }]);

  const blockForm = page.locator('[data-testid="block-form"]');
  await blockForm.locator('#block-date').fill(MONDAY);
  await blockForm.locator('#block-start').fill('10:00');
  await blockForm.locator('#block-end').fill('10:30');
  await page.locator('[data-testid="block-submit"]').click();
  await expect(page.locator('[data-testid="block-item"]')).toHaveCount(1, { timeout: 10_000 });
  expect(captured.blockPosts).toEqual([{ startsAt: `${MONDAY}T10:00:00.000Z`, endsAt: `${MONDAY}T10:30:00.000Z` }]);

  const preview = page.locator('[data-testid="slot-preview"]');
  await expect(preview.locator('#preview-service option')).toHaveCount(1);
  await preview.locator('#preview-date').fill(MONDAY);
  await page.locator('[data-testid="preview-submit"]').click();
  const slots = preview.locator('[data-testid="slot-item"]');
  await expect(slots).toHaveText(['09:00', '09:30', '10:30', '11:00', '11:30'], { timeout: 10_000 });

  await page.locator('[data-testid="block-remove"]').click();
  await expect(page.locator('[data-testid="block-item"]')).toHaveCount(0);
  expect(captured.deletes).toHaveLength(1);
  await page.locator('[data-testid="preview-submit"]').click();
  await expect(slots).toHaveCount(6);
});

test('overlapping or inverted hours are rejected client-side without a request', async ({ page }) => {
  const captured = await mockApi(page);
  await signIn(page);
  await page.goto('/#/availability');
  const monday = page.locator('[data-testid="availability-day"][data-day="1"]');
  await monday.locator('[data-testid="day-enabled"]').check();
  await monday.locator('[data-testid="day-start"]').fill('12:00');
  await monday.locator('[data-testid="day-end"]').fill('09:00');
  await page.locator('[data-testid="week-save"]').click();
  await expect(page.locator('[data-testid="week-error"]')).toBeVisible();
  expect(captured.puts).toEqual([]);
});
