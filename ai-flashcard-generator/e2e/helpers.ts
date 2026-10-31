import type { Page } from '@playwright/test';
import { TERMS_VERSION } from '../lib/terms';

/** Start as a returning visitor who already accepted the terms and storage notice. */
export async function acceptConsent(page: Page) {
  await page.addInitScript((version) => {
    localStorage.setItem(
      'flashly:consent:v1',
      JSON.stringify({ terms: { version, at: Date.now() }, storage: 'accepted' })
    );
  }, TERMS_VERSION);
}
