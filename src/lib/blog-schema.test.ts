import { describe, it, expect } from 'vitest'
import { buildBlogPostingJsonLd } from './blog-schema'
import { SITE_URL, ORG_LEGAL_NAME, BRAND_LAYER } from './seo'

const BASE = {
  slug: 'moreska-history',
  title: 'A short history of the Moreška',
  excerpt: 'How a Mediterranean ritual found its last home on Korčula.',
  heroImage: '/moreska01.webp',
  publishedAt: '2026-05-01T08:00:00.000Z',
}

describe('buildBlogPostingJsonLd', () => {
  it('emits a BlogPosting with the legal-entity Organization as both publisher and author (ADR-0003)', () => {
    const ld = buildBlogPostingJsonLd(BASE)

    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toBe('BlogPosting')
    expect(ld.headline).toBe(BASE.title)
    expect(ld.description).toBe(BASE.excerpt)
    expect(ld.datePublished).toBe(BASE.publishedAt)
    expect(ld.url).toBe(`${SITE_URL}/blog/${BASE.slug}`)

    const author = ld.author as Record<string, unknown>
    const publisher = ld.publisher as Record<string, unknown>
    expect(author).toEqual(publisher)
    expect(publisher['@type']).toBe('Organization')
    expect(publisher.name).toBe(ORG_LEGAL_NAME)
    expect(publisher.alternateName).toBe(BRAND_LAYER)
    expect(publisher.url).toBe(SITE_URL)
    const logo = publisher.logo as Record<string, unknown>
    expect(logo['@type']).toBe('ImageObject')
    expect(logo.url).toContain(SITE_URL)
  })

  it('absolutizes a /public-rooted hero image', () => {
    const ld = buildBlogPostingJsonLd(BASE)
    expect(ld.image).toEqual([`${SITE_URL}/moreska01.webp`])
  })

  it('leaves an already-absolute image URL untouched', () => {
    const ld = buildBlogPostingJsonLd({
      ...BASE,
      heroImage: 'https://cdn.example.com/hero.jpg',
    })
    expect(ld.image).toEqual(['https://cdn.example.com/hero.jpg'])
  })

  it('falls back to publishedAt for dateModified when updatedAt is omitted', () => {
    const ld = buildBlogPostingJsonLd(BASE)
    expect(ld.dateModified).toBe(BASE.publishedAt)
  })

  it('uses updatedAt for dateModified when provided', () => {
    const ld = buildBlogPostingJsonLd({
      ...BASE,
      updatedAt: '2026-05-20T08:00:00.000Z',
    })
    expect(ld.dateModified).toBe('2026-05-20T08:00:00.000Z')
  })

  it('sets mainEntityOfPage to the canonical post URL', () => {
    const ld = buildBlogPostingJsonLd(BASE)
    const main = ld.mainEntityOfPage as Record<string, unknown>
    expect(main['@type']).toBe('WebPage')
    expect(main['@id']).toBe(`${SITE_URL}/blog/${BASE.slug}`)
  })
})
