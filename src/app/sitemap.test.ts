import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SITE_URL } from '@/lib/seo'

vi.mock('@/lib/shows', () => ({
  getUpcomingShows: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/posts', () => ({
  getAllPublishedSlugs: vi.fn(),
}))

import sitemap from './sitemap'
import { getAllPublishedSlugs } from '@/lib/posts'

describe('sitemap', () => {
  beforeEach(() => vi.clearAllMocks())

  it('includes /blog as a static route', async () => {
    vi.mocked(getAllPublishedSlugs).mockResolvedValue([])
    const urls = (await sitemap()).map((r) => r.url)
    expect(urls).toContain(`${SITE_URL}/blog`)
  })

  it('includes /faq as a static route', async () => {
    vi.mocked(getAllPublishedSlugs).mockResolvedValue([])
    const urls = (await sitemap()).map((r) => r.url)
    expect(urls).toContain(`${SITE_URL}/faq`)
  })

  it('expands every published post into a /blog/[slug] entry', async () => {
    vi.mocked(getAllPublishedSlugs).mockResolvedValue([
      { slug: 'moreska-history', locale: 'en', updatedAt: '2026-05-01T08:00:00.000Z' },
      { slug: 'klapa-na-skverina', locale: 'hr', updatedAt: '2026-04-12T08:00:00.000Z' },
    ])
    const urls = (await sitemap()).map((r) => r.url)
    expect(urls).toContain(`${SITE_URL}/blog/moreska-history`)
    expect(urls).toContain(`${SITE_URL}/blog/klapa-na-skverina`)
  })

  it('still emits the static routes if posts lookup throws (build-time DB outage)', async () => {
    vi.mocked(getAllPublishedSlugs).mockRejectedValue(new Error('db down'))
    const urls = (await sitemap()).map((r) => r.url)
    expect(urls).toContain(`${SITE_URL}/blog`)
    expect(urls).toContain(`${SITE_URL}/about`)
  })
})
