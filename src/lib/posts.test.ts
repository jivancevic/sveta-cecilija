import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMock = vi.fn()

vi.mock('payload', () => ({
  getPayload: vi.fn().mockResolvedValue({ find: (...args: unknown[]) => findMock(...args) }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

import { getPostBySlug, getPublishedPosts, getAllPublishedSlugs } from './posts'

const SAMPLE_DOC = {
  id: 7,
  slug: 'moreska-history',
  title: 'A short history of the Moreška',
  excerpt: 'How a Mediterranean ritual found its last home on Korčula.',
  heroImage: '/moreska01.webp',
  heroImageAlt: 'Two Moreška dancers crossing swords',
  locale: 'en',
  publishedAt: '2026-05-01T08:00:00.000Z',
  updatedAt: '2026-05-02T08:00:00.000Z',
  body: { root: { type: 'root', children: [] } },
}

describe('posts data layer', () => {
  beforeEach(() => {
    findMock.mockReset()
  })

  describe('getPostBySlug', () => {
    it('returns null when no row matches — the page route uses this to fire notFound()', async () => {
      findMock.mockResolvedValue({ docs: [] })
      const result = await getPostBySlug('missing-slug', 'en')
      expect(result).toBeNull()
    })

    it('maps the Payload row to the public-facing PostFull shape', async () => {
      findMock.mockResolvedValue({ docs: [SAMPLE_DOC] })
      const result = await getPostBySlug('moreska-history', 'en')
      expect(result).not.toBeNull()
      expect(result!.slug).toBe('moreska-history')
      expect(result!.title).toBe(SAMPLE_DOC.title)
      expect(result!.excerpt).toBe(SAMPLE_DOC.excerpt)
      expect(result!.heroImage).toBe('/moreska01.webp')
      expect(result!.heroImageAlt).toBe(SAMPLE_DOC.heroImageAlt)
      expect(result!.body).toEqual(SAMPLE_DOC.body)
    })

    it('queries with a published-only, locale-scoped, dated-in-the-past filter', async () => {
      findMock.mockResolvedValue({ docs: [] })
      await getPostBySlug('whatever', 'hr')
      const args = findMock.mock.calls[0]?.[0] as {
        collection: string
        where: { and: Array<Record<string, unknown>> }
      }
      expect(args.collection).toBe('posts')
      const flatKeys = args.where.and.map((c) => Object.keys(c)[0])
      expect(flatKeys).toEqual(
        expect.arrayContaining(['slug', 'status', 'locale', 'publishedAt']),
      )
    })
  })

  describe('getPublishedPosts', () => {
    it('returns only the active locale and orders newest first', async () => {
      findMock.mockResolvedValue({ docs: [SAMPLE_DOC] })
      const result = await getPublishedPosts('en')
      expect(result).toHaveLength(1)
      const args = findMock.mock.calls[0]?.[0] as { sort: string }
      expect(args.sort).toBe('-publishedAt')
    })
  })

  describe('getAllPublishedSlugs', () => {
    it('is locale-agnostic — sitemap needs every published slug', async () => {
      findMock.mockResolvedValue({
        docs: [
          { ...SAMPLE_DOC, slug: 'a', locale: 'en' },
          { ...SAMPLE_DOC, slug: 'b', locale: 'hr' },
        ],
      })
      const result = await getAllPublishedSlugs()
      expect(result.map((p) => p.slug)).toEqual(['a', 'b'])
      const args = findMock.mock.calls[0]?.[0] as {
        where: { and: Array<Record<string, unknown>> }
      }
      // No locale filter — both EN + HR slugs appear in the result.
      const hasLocaleFilter = args.where.and.some((c) => 'locale' in c)
      expect(hasLocaleFilter).toBe(false)
    })
  })
})
