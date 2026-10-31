import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION } from '@/lib/site';

/** Lets people install Flashly to their home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Flashly – AI flashcards & quizzes',
    short_name: 'Flashly',
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#fff8ee',
    theme_color: '#6c47ff',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
