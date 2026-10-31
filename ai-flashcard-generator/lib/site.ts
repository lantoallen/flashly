/**
 * The public address of the site, used for absolute links in metadata,
 * the sitemap and social previews. Set NEXT_PUBLIC_SITE_URL to override.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')
).replace(/\/+$/, '');

export const SITE_NAME = 'Flashly';
export const SITE_DESCRIPTION =
  'Paste your notes or type a topic and Flashly builds flashcards, quizzes and a match game in seconds. Free, no account needed.';

/** The logo as an SVG data URL, for generated images (social preview, app icons). */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none"><defs><linearGradient id="g" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#ff5d73"/><stop offset="1" stop-color="#6c47ff"/></linearGradient></defs><rect x="3" y="3" width="36" height="36" rx="11" fill="#1b1033"/><rect x="1" y="1" width="36" height="36" rx="11" fill="url(#g)" stroke="#1b1033" stroke-width="2.5"/><rect x="10.5" y="9" width="7" height="22" rx="3.5" fill="#fff"/><rect x="10.5" y="9" width="17" height="7" rx="3.5" fill="#fff"/><rect x="10.5" y="19" width="12" height="6" rx="3" fill="#fff"/><circle cx="28.5" cy="27.5" r="4.2" fill="#ffc83d" stroke="#1b1033" stroke-width="2"/></svg>`;

export const LOGO_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString('base64')}`;
