import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { SECTION_PAGE_META, SERVICE_PAGE_META } from '@/lib/data';
import { getUpcomingShows } from '@/lib/shows';
import { getAllPublishedSlugs } from '@/lib/posts';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/tickets`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
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

  let blogRoutes: MetadataRoute.Sitemap = [];
  try {
    // Index every published post. URL space is shared across locales (no
    // /en or /hr prefix); each slug is unique site-wide via the Posts
    // collection's `slug` uniqueness constraint.
    const slugs = await getAllPublishedSlugs();
    blogRoutes = slugs.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  } catch {
    // DB unavailable during build; skip.
  }

  return [...staticRoutes, ...sectionRoutes, ...serviceRoutes, ...checkoutRoutes, ...blogRoutes];
}
