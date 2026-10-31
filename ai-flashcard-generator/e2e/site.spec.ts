import { expect, test } from '@playwright/test';

test('responses carry the security headers', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('search and sharing files are served', async ({ request }) => {
  for (const path of ['/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/opengraph-image', '/icons/192']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test('unknown pages show the friendly 404', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('We couldn’t find that page')).toBeVisible();
});

test('the API rejects bad input politely', async ({ request }) => {
  const res = await request.post('/api/generate', { data: {} });
  expect([400, 503]).toContain(res.status());
  expect((await res.json()).error).toBeTruthy();
});
