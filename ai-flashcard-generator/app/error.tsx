'use client'; // Error boundaries must be Client Components

import Link from 'next/link';
import { useEffect } from 'react';
import PetFigure from '@/components/PetFigure';

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && 'digest' in error ? String((error as { digest?: string }).digest ?? '') : '';

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
      <PetFigure mood="sad" size={110} />
      <h1 className="text-3xl font-extrabold tracking-tight">Something went wrong</h1>
      <p className="text-muted">
        Sorry about that. Your sets are safe in your library. Try again, and if
        it keeps happening, reload the page.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className="btn btn-primary">
          Try again
        </button>
        <Link href="/library" className="btn btn-secondary">
          My library
        </Link>
      </div>
      {digest && <p className="text-xs text-muted">Error reference: {digest}</p>}
    </div>
  );
}
