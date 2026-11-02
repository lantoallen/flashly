import { expect, test } from '@playwright/test';
import { acceptConsent } from './helpers';

test.beforeEach(async ({ page }) => acceptConsent(page));

test('the demo set opens and flashcards flip and track progress', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a demo set' }).first().click();
  await expect(page).toHaveURL(/\/study\//);

  const card = page.locator('.flip-card').first();
  await expect(card).toHaveAttribute('data-flipped', 'false');
  await card.click();
  await expect(card).toHaveAttribute('data-flipped', 'true');

  await page.getByRole('button', { name: 'Got it' }).click();
  const known = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('flashly:sets:v1') ?? '[]')[0].cards.filter((c: { known?: boolean }) => c.known).length
  );
  expect(known).toBe(1);
});

test('Space flips the card after "Got it" instead of pressing it again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a demo set' }).first().click();

  await page.getByRole('button', { name: 'Got it' }).click();
  await page.keyboard.press('Space');
  await expect(page.locator('.flip-card').first()).toHaveAttribute('data-flipped', 'true');
  const known = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('flashly:sets:v1') ?? '[]')[0].cards.filter((c: { known?: boolean }) => c.known).length
  );
  expect(known).toBe(1);
});

test('a quiz can be answered from start to results', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a demo set' }).first().click();
  await page.getByRole('tab', { name: /Quiz/ }).click();
  await page.getByRole('button', { name: /Start quiz/ }).click();

  for (let i = 0; i < 25; i++) {
    const next = page.getByRole('button', { name: /^(Next|See results)/ });
    if (await page.getByText(/of \d+ correct/).isVisible()) break;
    await page.locator('ul button').first().click();
    await next.click();
  }
  await expect(page.getByText(/of \d+ correct/)).toBeVisible();
});

test('cards can be built by hand with no AI', async ({ page }) => {
  await page.goto('/create');
  await page.getByRole('tab', { name: 'Type your own' }).click();
  await page.locator('#manual-title').fill('Capitals');

  const pairs = [
    ['France', 'Paris'],
    ['Japan', 'Tokyo'],
    ['Kenya', 'Nairobi'],
  ];
  for (const [i, [term, definition]] of pairs.entries()) {
    await page.locator('textarea[id^="term-"]').nth(i).fill(term);
    await page.locator('textarea[id^="def-"]').nth(i).fill(definition);
  }
  await page.getByRole('button', { name: /Create set/ }).click();

  await expect(page).toHaveURL(/\/study\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Capitals' })).toBeVisible();
});

test('generating from a topic builds a set (AI response mocked)', async ({ page }) => {
  await page.route('**/api/generate', async (route) => {
    const { count } = route.request().postDataJSON() as { count: number };
    await route.fulfill({
      json: {
        title: 'Planets',
        cards: Array.from({ length: count }, (_, i) => ({
          term: `Planet ${i + 1}`,
          definition: `Fact about planet ${i + 1}`,
          distractors: ['A', 'B', 'C'],
        })),
      },
    });
  });

  await page.goto('/create');
  await page.getByRole('tab', { name: 'Enter a topic' }).click();
  await page.locator('#topic').fill('Planets');
  await page.locator('#count').fill('5');
  await page.getByRole('button', { name: /Generate 5/ }).click();

  await expect(page).toHaveURL(/\/study\//);
  const cards = await page.evaluate(
    () => JSON.parse(localStorage.getItem('flashly:sets:v1') ?? '[]')[0].cards.length
  );
  expect(cards).toBe(5);
});
