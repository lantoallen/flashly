import { useSyncExternalStore } from 'react';

import { TERMS_VERSION } from './terms';

export { TERMS_VERSION };

/** Records the visitor's choices about the terms and the storage notice. */

const KEY = 'flashly:consent:v1';
const EVENT = 'flashly:consent-changed';
const OPEN_EVENT = 'flashly:open-terms';

export type Consent = {
  terms?: { version: string; at: number };
  /** 'accepted' or 'dismissed' for the storage/cookie notice. */
  storage?: 'accepted' | 'dismissed';
};

const EMPTY: Consent = {};
let cachedRaw: string | null = null;
let cached: Consent = EMPTY;

function read(): Consent {
  if (typeof window === 'undefined') return EMPTY;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    cached = parsed && typeof parsed === 'object' ? (parsed as Consent) : EMPTY;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

function write(next: Consent) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: remember for this page view only.
    cachedRaw = null;
    cached = next;
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useConsent(): Consent {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function hasAcceptedTerms(consent: Consent = read()): boolean {
  return consent.terms?.version === TERMS_VERSION;
}

// What the visitor was doing when the dialog opened, resumed once they accept.
let pending: (() => void) | null = null;

export function acceptTerms(): void {
  write({ ...read(), terms: { version: TERMS_VERSION, at: Date.now() } });
  const resume = pending;
  pending = null;
  resume?.();
}

/** The dialog was closed without accepting: forget the waiting action. */
export function cancelTermsRequest(): void {
  pending = null;
}

export function setStorageChoice(choice: 'accepted' | 'dismissed'): void {
  write({ ...read(), storage: choice });
}

/** Ask the consent gate to show the terms dialog. */
export function requestTerms(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Call before an action that sends the visitor's text to an AI provider or
 * creates an account. Returns false (and shows the dialog) until they accept;
 * `resume` then runs as soon as they do, so they don't have to click again.
 */
export function ensureTerms(resume?: () => void): boolean {
  if (hasAcceptedTerms()) return true;
  pending = resume ?? null;
  requestTerms();
  return false;
}

export function onTermsRequested(handler: () => void) {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
