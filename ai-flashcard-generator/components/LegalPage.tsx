import Link from 'next/link';
import type { ReactNode } from 'react';
import { TERMS_VERSION } from '@/lib/terms';

export const REPO_URL = 'https://github.com/lantoallen/flashly';
/** Private contact for privacy requests and anything not for a public issue. Change it if you run your own copy. */
export const CONTACT_EMAIL = 'lantoallen07@gmail.com';

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-5xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm font-semibold text-muted">
        Version {TERMS_VERSION}
      </p>
      <p className="mt-5 text-lg text-muted">{intro}</p>
      <div className="mt-10 flex flex-col gap-10 [&_a]:font-semibold [&_a]:text-primary-ink [&_a]:underline [&_h2]:text-2xl [&_h2]:font-extrabold [&_li]:text-muted [&_p]:text-muted [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        {children}
      </div>
      <div className="mt-14 flex flex-wrap gap-3">
        <Link href="/terms" className="btn btn-secondary">
          Terms
        </Link>
        <Link href="/privacy" className="btn btn-secondary">
          Privacy Policy
        </Link>
        <Link href="/" className="btn btn-primary">
          Back to Flashly
        </Link>
      </div>
    </div>
  );
}
