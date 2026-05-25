import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { SECTION_PAGE_META, SERVICE_PAGE_META } from '@/lib/data';
import { getUpcomingShows } from '@/lib/shows';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/tickets`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/privacy-policy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/cookie-policy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const sectionRoutes: MetadataRoute.Sitemap = Object.keys(SECTION_PAGE_META).map((slug) => ({
    url: `${SITE_URL}/sections/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const serviceRoutes: MetadataRoute.Sitemap = Object.keys(SERVICE_PAGE_META).map((slug) => ({
    url: `${SITE_URL}/services/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  let checkoutRoutes: MetadataRoute.Sitemap = [];
  try {
    const shows = await getUpcomingShows();
    checkoutRoutes = shows.map((s) => ({
      url: `${SITE_URL}/checkout/${s.id}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.5,
    }));
  } catch {
    // DB may be unavailable during build; degrade gracefully.
  }

  return [...staticRoutes, ...sectionRoutes, ...serviceRoutes, ...checkoutRoutes];
}
