import PetFigure from '@/components/PetFigure';

/** Shown while a page's code loads during navigation. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 px-4 py-24 text-center"
    >
      <PetFigure mood="thinking" size={90} />
      <p className="font-bold text-muted">Loading…</p>
    </div>
  );
}
