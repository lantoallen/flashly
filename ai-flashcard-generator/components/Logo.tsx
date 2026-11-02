import { useId } from 'react';

/**
 * Letter-mark "F": three rounded bars (a card stack turned into a letter)
 * plus a sun-yellow dot, on a coral-to-violet tile.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  const gradientId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff5d73" />
          <stop offset="1" stopColor="#6c47ff" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="36" height="36" rx="11" fill="#1b1033" />
      <rect x="1" y="1" width="36" height="36" rx="11" fill={`url(#${gradientId})`} stroke="#1b1033" strokeWidth="2.5" />
      <rect x="10.5" y="9" width="7" height="22" rx="3.5" fill="#fff" />
      <rect x="10.5" y="9" width="17" height="7" rx="3.5" fill="#fff" />
      <rect x="10.5" y="19" width="12" height="6" rx="3" fill="#fff" />
      <circle cx="28.5" cy="27.5" r="4.2" fill="#ffc83d" stroke="#1b1033" strokeWidth="2" />
    </svg>
  );
}

export function Logo({
  size = 40,
  wordmarkClassName = '',
}: {
  size?: number;
  /** Extra classes for the "Flashly" text, e.g. to hide it on narrow screens. */
  wordmarkClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`font-display text-2xl font-extrabold tracking-tight ${wordmarkClassName}`}>
        Flash<span className="brand-text">ly</span>
      </span>
    </span>
  );
}
