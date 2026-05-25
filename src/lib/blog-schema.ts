import { SITE_URL, ORG_LEGAL_NAME, BRAND_LAYER } from './seo'

export interface BlogPostingInput {
  slug: string
  title: string
  excerpt: string
  heroImage: string // path or absolute URL
  publishedAt: string // ISO
  updatedAt?: string // ISO
}

function absolutize(urlOrPath: string): string {
  if (/^https?:\/\//.test(urlOrPath)) return urlOrPath
  return `${SITE_URL}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`
}

/**
 * Build a schema.org BlogPosting JSON-LD object for a single post.
 *
 * Per ADR-0003: publisher = HGD Sveta Cecilija (legal entity Organization),
 * alternateName = "Moreška by HGD Sveta Cecilija" (consumer-facing brand).
 * Author is the same Organization — HGD-authored content, no individual byline.
 */
export function buildBlogPostingJsonLd(input: BlogPostingInput): Record<string, unknown> {
  const url = `${SITE_URL}/blog/${input.slug}`
  const image = absolutize(input.heroImage)
  const publisher = {
    '@type': 'Organization',
    name: ORG_LEGAL_NAME,
    alternateName: BRAND_LAYER,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/cecilija-logo.webp`,
    },
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: input.title,
    description: input.excerpt,
    image: [image],
    datePublished: input.publishedAt,
    dateModified: input.updatedAt ?? input.publishedAt,
    author: publisher,
    publisher,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    url,
  }
}
