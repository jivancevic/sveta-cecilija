import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import type { Locale } from '@/proxy'

export interface PostSummary {
  id: string
  slug: string
  title: string
  excerpt: string
  heroImage: string
  heroImageAlt?: string
  locale: Locale
  publishedAt: string // ISO
}

export interface PostFull extends PostSummary {
  body: unknown // lexical SerializedEditorState
  updatedAtPublic?: string // ISO
  updatedAt: string // ISO
}

const PUBLIC_WHERE = (locale: Locale): Where => ({
  and: [
    { status: { equals: 'published' } },
    { locale: { equals: locale } },
    { publishedAt: { less_than_equal: new Date().toISOString() } },
  ],
})

function mapSummary(doc: Record<string, unknown>): PostSummary {
  return {
    id: String(doc.id),
    slug: String(doc.slug),
    title: String(doc.title),
    excerpt: String(doc.excerpt),
    heroImage: String(doc.heroImage),
    heroImageAlt: (doc.heroImageAlt as string | undefined) ?? undefined,
    locale: (doc.locale as Locale) ?? 'en',
    publishedAt: new Date(doc.publishedAt as string).toISOString(),
  }
}

export async function getPublishedPosts(locale: Locale, limit = 50): Promise<PostSummary[]> {
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'posts',
    where: PUBLIC_WHERE(locale),
    sort: '-publishedAt',
    limit,
    depth: 0,
  })
  return res.docs.map((d) => mapSummary(d as Record<string, unknown>))
}

export async function getPostBySlug(slug: string, locale: Locale): Promise<PostFull | null> {
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'posts',
    where: {
      and: [
        { slug: { equals: slug } },
        ...((PUBLIC_WHERE(locale).and as Where[]) ?? []),
      ],
    } as Where,
    limit: 1,
    depth: 0,
  })
  const doc = res.docs[0] as Record<string, unknown> | undefined
  if (!doc) return null
  return {
    ...mapSummary(doc),
    body: doc.body,
    updatedAtPublic: doc.updatedAtPublic
      ? new Date(doc.updatedAtPublic as string).toISOString()
      : undefined,
    updatedAt: new Date(doc.updatedAt as string).toISOString(),
  }
}

/** All published-and-live slugs for sitemap generation, regardless of locale. */
export async function getAllPublishedSlugs(): Promise<
  Array<{ slug: string; locale: Locale; updatedAt: string }>
> {
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'posts',
    where: {
      and: [
        { status: { equals: 'published' } },
        { publishedAt: { less_than_equal: new Date().toISOString() } },
      ],
    },
    sort: '-publishedAt',
    limit: 500,
    depth: 0,
  })
  return res.docs.map((d) => {
    const doc = d as Record<string, unknown>
    return {
      slug: String(doc.slug),
      locale: (doc.locale as Locale) ?? 'en',
      updatedAt: new Date((doc.updatedAt ?? doc.publishedAt) as string).toISOString(),
    }
  })
}
