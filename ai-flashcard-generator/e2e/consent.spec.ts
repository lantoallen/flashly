import { expect, test } from '@playwright/test';

test('first visit asks for terms and storage choices, and remembers them', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Terms and Conditions' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('region', { name: 'Storage notice' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Accept and continue' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('region', { name: 'Storage notice' }).getByRole('button', { name: 'Accept' }).click();

  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Terms and Conditions' })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Storage notice' })).toBeHidden();
});

test('closing the terms is not the same as accepting them', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: 'Terms and Conditions' }).getByRole('button', { name: 'Close' }).click();
  const stored = await page.evaluate(() => localStorage.getItem('flashly:consent:v1'));
  expect(stored === null || !JSON.parse(stored).terms).toBe(true);
});

test('legal pages are readable without the dialog in the way', async ({ page }) => {
  for (const path of ['/terms', '/privacy']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Terms and Conditions' })).toBeHidden();
  }
});

test('an action that needed the terms carries on once they are accepted', async ({ page }) => {
  await page.route('**/api/generate', (route) =>
    route.fulfill({
      json: {
        title: 'Planets',
        cards: Array.from({ length: 3 }, (_, i) => ({
          term: `Planet ${i + 1}`,
          definition: `Fact about planet ${i + 1}`,
          distractors: ['A', 'B', 'C'],
        })),
      },
    })
  );

  await page.goto('/create');
  const dialog = page.getByRole('dialog', { name: 'Terms and Conditions' });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('region', { name: 'Storage notice' }).getByRole('button', { name: 'Accept' }).click();

  await page.getByRole('tab', { name: 'Enter a topic' }).click();
  await page.locator('#topic').fill('Planets');
  await page.locator('#count').fill('3');
  await page.getByRole('button', { name: /Generate 3/ }).click();

  await dialog.getByRole('button', { name: 'Accept and continue' }).click();
  await expect(page).toHaveURL(/\/study\//);
});
