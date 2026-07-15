import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import path from 'path'
import {
  inlineToNodes,
  bodyToLexical,
  parsePostDraft,
  lexicalPlainText,
  toPostsSeedSql,
  type PostSeedEntry,
  type SerializedListNode,
  type SerializedLinkNode,
} from '@/lib/post-seed'

const DRAFTS_DIR = path.resolve(process.cwd(), 'docs/blog-drafts')
const DRAFT_FILES = readdirSync(DRAFTS_DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .sort()
const ENTRIES: PostSeedEntry[] = DRAFT_FILES.map((f) =>
  parsePostDraft(readFileSync(path.join(DRAFTS_DIR, f), 'utf8'), f),
)

describe('inlineToNodes', () => {
  it('splits bold, italic and links', () => {
    const nodes = inlineToNodes('**a** [b](/tickets) *c*')
    expect(nodes.map((n) => n.type)).toEqual(['text', 'text', 'link', 'text', 'text'])
    const link = nodes[2] as SerializedLinkNode
    expect(link.fields).toEqual({ linkType: 'custom', newTab: false, url: '/tickets' })
    expect(link.children[0].text).toBe('b')
  })

  it('handles the bold-link CTA shape', () => {
    const nodes = inlineToNodes('**[Book tickets →](/tickets)**')
    expect(nodes).toHaveLength(1)
    const link = nodes[0] as SerializedLinkNode
    expect(link.type).toBe('link')
    expect(link.children[0].format).toBe(1)
    expect(link.children[0].text).toBe('Book tickets →')
  })

  it('rejects locale-prefixed internal URLs (hard rule)', () => {
    expect(() => inlineToNodes('[x](/en/tickets)')).toThrow(/locale-prefixed/)
    expect(() => inlineToNodes('[x](/hr)')).toThrow(/locale-prefixed/)
  })
})

describe('bodyToLexical', () => {
  it('maps headings, lists, quotes and paragraphs', () => {
    const state = bodyToLexical(
      '# H1 dropped\n\nIntro para.\n\n## Section\n\n- **one** item\n- two\n\n1. first\n2. second\n\n> a public quote\n',
    )
    expect(state.root.children.map((b) => b.type)).toEqual([
      'paragraph',
      'heading',
      'list',
      'list',
      'quote',
    ])
    const [ul, ol] = state.root.children.filter((b): b is SerializedListNode => b.type === 'list')
    expect(ul.listType).toBe('bullet')
    expect(ul.children).toHaveLength(2)
    expect(ul.children[0].type).toBe('listitem')
    expect(ol.listType).toBe('number')
    expect(ol.tag).toBe('ol')
  })

  it('drops a quote only when it opens the body (internal HR-izdanje note)', () => {
    const lead = bodyToLexical('# T\n\n> internal note\n\nReal para.')
    expect(lead.root.children.map((b) => b.type)).toEqual(['paragraph'])
    const mid = bodyToLexical('# T\n\nPara.\n\n> kept quote')
    expect(mid.root.children.map((b) => b.type)).toEqual(['paragraph', 'quote'])
  })
})

describe('parsePostDraft (real drafts)', () => {
  it('parses all 8 drafts (6 EN + 2 HR)', () => {
    expect(ENTRIES).toHaveLength(8)
    expect(ENTRIES.filter((e) => e.locale === 'en')).toHaveLength(6)
    expect(ENTRIES.filter((e) => e.locale === 'hr')).toHaveLength(2)
  })

  it('slugs are unique per locale and match the cross-links used in the copy', () => {
    const keys = ENTRIES.map((e) => `${e.locale}:${e.slug}`)
    expect(new Set(keys).size).toBe(keys.length)
    const enSlugs = ENTRIES.filter((e) => e.locale === 'en').map((e) => e.slug)
    // Posts 1/2/3 cross-link each other by these exact slugs.
    expect(enSlugs).toContain('what-to-expect-moreska-performance-korcula')
    expect(enSlugs).toContain('is-moreska-suitable-for-kids')
    expect(enSlugs).toContain('history-of-moreska-sword-dance')
  })

  it('every hero image exists in public/', () => {
    for (const e of ENTRIES) {
      expect(e.heroImage.startsWith('/')).toBe(true)
      expect(existsSync(path.resolve(process.cwd(), 'public', e.heroImage.slice(1)))).toBe(true)
    }
  })

  it('strips review scaffolding: no citations, verify notes or em-dash in any body', () => {
    for (const e of ENTRIES) {
      expect(e.bodyText).not.toMatch(/Verify before publishing|Provjeriti prije objave|—/)
      expect(e.bodyText).not.toContain('docs/sveta-cecilija.md')
      expect(e.bodyText).not.toContain('flagged this for the editor')
    }
  })

  it('publishes 6 posts; post 06 (EN+HR) is forced draft by its ⚠️ interview placeholders', () => {
    const published = ENTRIES.filter((e) => e.status === 'published')
    const drafts = ENTRIES.filter((e) => e.status === 'draft')
    expect(published).toHaveLength(6)
    expect(drafts.map((e) => e.slug).sort()).toEqual([
      'behind-the-scenes-moreska-dancers',
      'iza-kulisa-moreskanti',
    ])
    for (const e of published) expect(e.bodyText).not.toContain('⚠️')
    for (const e of drafts) expect(e.bodyText).toContain('⚠️')
  })

  it('drops the internal HR-izdanje note from the two Croatian posts', () => {
    for (const e of ENTRIES.filter((x) => x.locale === 'hr')) {
      expect(e.bodyText).not.toContain('HR-izdanje')
    }
  })

  it('does not repeat the title as a body heading (H1 dropped)', () => {
    for (const e of ENTRIES) {
      const headings = e.body.root.children.filter((b) => b.type === 'heading')
      expect(headings.length).toBeGreaterThan(2)
      expect(headings.every((h) => 'tag' in h && (h.tag === 'h2' || h.tag === 'h3'))).toBe(true)
    }
  })

  it('keeps internal links and never locale-prefixes them', () => {
    const urls: string[] = []
    for (const e of ENTRIES)
      for (const b of e.body.root.children) {
        const inline = b.type === 'list' ? b.children.flatMap((li) => li.children) : b.children
        for (const n of inline) if (n.type === 'link') urls.push(n.fields.url)
      }
    expect(urls.length).toBeGreaterThan(10)
    expect(urls).toContain('/tickets')
    expect(urls.every((u) => !/^\/(en|hr)(\/|$)/.test(u))).toBe(true)
  })

  it('publishedAt carries the staggered 1/month cadence', () => {
    const en = ENTRIES.filter((e) => e.locale === 'en').map((e) => e.publishedAt.slice(0, 7))
    expect([...en].sort()).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'])
  })

  it('body text survives round-tripping (spot check post 3 content)', () => {
    const kids = ENTRIES.find((e) => e.slug === 'is-moreska-suitable-for-kids')!
    expect(kids.bodyText).toContain('Children under 14 are €10; adults are €20.')
    expect(lexicalPlainText(kids.body)).toBe(kids.bodyText)
  })
})

describe('toPostsSeedSql', () => {
  const sql = toPostsSeedSql(ENTRIES)

  it('emits one guarded insert per entry', () => {
    expect(sql.match(/INSERT INTO posts/g)).toHaveLength(ENTRIES.length)
    expect(sql.match(/\nWHERE NOT EXISTS/g)).toHaveLength(ENTRIES.length)
  })

  it('escapes quotes and casts enums/jsonb/timestamptz', () => {
    expect(sql).toContain("::enum_posts_locale")
    expect(sql).toContain("::enum_posts_status")
    expect(sql).toContain('::jsonb')
    expect(sql).toContain('::timestamptz')
    // Titles contain apostrophes ("Parent's Guide") — must be doubled.
    expect(sql).toContain("Parent''s Guide")
  })
})
