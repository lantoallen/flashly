import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Personal and members-only pages have nothing useful for search engines.
      disallow: ['/api/', '/account', '/messages', '/profile', '/people', '/u/', '/study/', '/shared'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
