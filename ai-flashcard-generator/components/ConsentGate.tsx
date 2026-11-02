'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import {
  acceptTerms,
  cancelTermsRequest,
  hasAcceptedTerms,
  onTermsRequested,
  setStorageChoice,
  useConsent,
} from '@/lib/consent';
import { useHydrated } from '@/lib/storage';

const POINTS = [
  'Flashly is a study aid. AI-generated cards can be incomplete or wrong, so check anything important.',
  'Your sets and progress are saved in this browser, or in your account if you sign in.',
  'When you generate cards or ask for an explanation, the text you submit is sent to an AI provider to be processed.',
  'Use Flashly lawfully, and only add content you have the right to use.',
  'The service is provided as it is and may change or go offline.',
];

/** Terms summary dialog + storage notice, shown until the visitor makes a choice. */
export default function ConsentGate() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const consent = useConsent();
  // The dialog can be closed for now; it returns on the next visit until accepted.
  const [closed, setClosed] = useState(false);
  const [forced, setForced] = useState(false);
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => onTermsRequested(() => setForced(true)), []);

  const onLegalPage = pathname === '/terms' || pathname === '/privacy';
  const accepted = hasAcceptedTerms(consent);
  const showTerms = hydrated && !accepted && !onLegalPage && (!closed || forced);
  const showStorage = hydrated && !consent.storage && !onLegalPage;

  useEffect(() => {
    if (!showTerms) return;
    acceptRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cancelTermsRequest();
        setClosed(true);
        setForced(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTerms]);

  function close() {
    cancelTermsRequest();
    setClosed(true);
    setForced(false);
  }

  return (
    <>
      {showTerms && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-title"
            className="panel pop max-h-[90vh] w-full max-w-xl overflow-y-auto p-6 sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="terms-title" className="font-display text-2xl font-extrabold sm:text-3xl">
                Terms and Conditions
              </h2>
              <button
                type="button"
                onClick={close}
                className="btn btn-secondary !p-2"
                aria-label="Close"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <p className="mt-4 text-muted">
              Before you use Flashly, please read this summary of the main points.
            </p>
            <ul className="mt-4 list-disc space-y-2.5 pl-5">
              {POINTS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-muted">
              This is a summary. The full{' '}
              <Link href="/terms" className="font-semibold text-primary-ink underline">
                Terms and Conditions
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="font-semibold text-primary-ink underline">
                Privacy Policy
              </Link>{' '}
              apply.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                ref={acceptRef}
                type="button"
                onClick={() => {
                  acceptTerms();
                  setForced(false);
                }}
                className="btn btn-primary"
              >
                Accept and continue
              </button>
              <Link href="/terms" className="btn btn-secondary">
                Read the full terms
              </Link>
            </div>
          </div>
        </div>
      )}

      {showStorage && (
        <div
          role="region"
          aria-label="Storage notice"
          className="fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_var(--shadow-color)] sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm">
            <strong>Cookies.</strong> Flashly does not set cookies. Your sets and
            settings stay in this browser’s local storage. Accept to remember your
            choice, or close this notice.{' '}
            <Link href="/privacy#storage" className="font-semibold text-primary-ink underline">
              Storage settings
            </Link>
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setStorageChoice('accepted')}
              className="btn btn-primary !py-2"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => setStorageChoice('dismissed')}
              className="btn btn-secondary !py-2"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
