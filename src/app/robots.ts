import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  // Staging (dev.moreska.eu) must never be indexed or compete with prod in
  // search. Block everything and emit no sitemap. Gated on NEXT_PUBLIC_ENV,
  // which is 'staging' only on the dev Coolify app (unset in prod + local).
  if (process.env.NEXT_PUBLIC_ENV === 'staging') {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // `/app` is the Moreškant roster tool (#421): internal, Croatian-only,
        // and behind a login. It also carries `robots: noindex` in its layout
        // and appears in no sitemap.
        disallow: ['/admin', '/admin/', '/api', '/api/', '/app', '/app/', '/scan/', '/checkout/*/confirmation'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
