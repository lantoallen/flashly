import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

const PAGES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/create', priority: 0.9 },
  { path: '/community', priority: 0.7 },
  { path: '/about', priority: 0.5 },
  { path: '/terms', priority: 0.2 },
  { path: '/privacy', priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    changeFrequency: 'weekly',
    priority: p.priority,
  }));
}
