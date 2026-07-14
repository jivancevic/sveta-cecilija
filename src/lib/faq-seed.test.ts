import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import {
  parseFaqDrafts,
  inlineToTextNodes,
  answerToLexical,
  lexicalPlainText,
  toSeedSql,
  FAQ_SEED_CATEGORIES,
} from '@/lib/faq-seed'

const DRAFTS = readFileSync(
  path.resolve(process.cwd(), 'docs/faq-drafts/faq-answers-en.md'),
  'utf8',
)

describe('inlineToTextNodes', () => {
  it('splits bold and italic runs', () => {
    const nodes = inlineToTextNodes('**a** b *c*')
    expect(nodes.map((n) => [n.text, n.format])).toEqual([
      ['a', 1],
      [' b ', 0],
      ['c', 2],
    ])
  })

  it('collapses internal newlines and returns a node for plain text', () => {
    const nodes = inlineToTextNodes('hello\n  world')
    expect(nodes).toEqual([
      { detail: 0, format: 0, mode: 'normal', style: '', text: 'hello world', type: 'text', version: 1 },
    ])
  })
})

describe('answerToLexical', () => {
  it('produces a valid root with one paragraph per block', () => {
    const state = answerToLexical('First para.\n\nSecond **para**.')
    expect(state.root.type).toBe('root')
    expect(state.root.children).toHaveLength(2)
    expect(state.root.children.every((p) => p.type === 'paragraph')).toBe(true)
    expect(lexicalPlainText(state)).toBe('First para. Second para.')
  })
})

describe('parseFaqDrafts (real drafts)', () => {
  const entries = parseFaqDrafts(DRAFTS)

  it('parses 45 question entries (47 ### headings minus 2 housekeeping)', () => {
    expect(entries).toHaveLength(45)
  })

  it('has 44 published + 1 draft', () => {
    expect(entries.filter((e) => e.status === 'published')).toHaveLength(44)
    expect(entries.filter((e) => e.status === 'draft')).toHaveLength(1)
  })

  it('assigns every entry a known category, all seven represented', () => {
    const cats = new Set(entries.map((e) => e.category))
    for (const e of entries) expect(FAQ_SEED_CATEGORIES).toContain(e.category)
    expect(cats.size).toBe(7)
  })

  it('strips citation tails, warning notes, and Croatian lines from answers', () => {
    for (const e of entries) {
      expect(e.answerText).not.toContain('—') // em-dash citation tail
      expect(e.answerText).not.toContain('⚠️')
      expect(e.answerText).not.toMatch(/\*Q\d/) // Croatian question line
      expect(e.answerText.length).toBeGreaterThan(20)
      expect(lexicalPlainText(e.answer).length).toBeGreaterThan(20)
    }
  })

  it('publishes everything except the still-flagged tour-list answer (Q49)', () => {
    const drafts = entries.filter((e) => e.status === 'draft')
    expect(drafts).toHaveLength(1)
    expect(drafts[0].question.toLowerCase()).toContain('which countries')
    expect(drafts[0].category).toBe('history')
    // the ⚠️ note is stripped but the confirmed Prague fact remains
    expect(drafts[0].answerText).toContain('Prague')
  })

  it('assigns unique ascending order values', () => {
    const orders = entries.map((e) => e.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('preserves inline bold in a known answer (Q1)', () => {
    const q1 = entries.find((e) => e.question === 'What is the Moreška?')
    expect(q1).toBeTruthy()
    const hasBold = q1!.answer.root.children.some((p) =>
      p.children.some((t) => t.format === 1 && t.text.includes('war dance')),
    )
    expect(hasBold).toBe(true)
  })

  it('maps the visiting section correctly', () => {
    const perf = entries.find((e) => e.question === 'Where is the Moreška performed?')
    expect(perf?.category).toBe('visiting')
  })
})

describe('toSeedSql', () => {
  const entries = parseFaqDrafts(DRAFTS)
  const sql = toSeedSql(entries)

  it('emits one guarded INSERT per entry', () => {
    expect((sql.match(/^INSERT INTO faqs /gm) ?? [])).toHaveLength(45)
    expect((sql.match(/WHERE NOT EXISTS \(SELECT 1 FROM faqs/g) ?? [])).toHaveLength(45)
  })

  it('escapes single quotes and embeds valid jsonb answers', () => {
    // apostrophes are doubled for SQL
    expect(sql).toContain("Europe''s last surviving authentic war dance")
    // every embedded ::jsonb literal round-trips to a Lexical root
    const jsonLiterals = sql.match(/SELECT '(?:[^']|'')*', '((?:[^']|'')*)'::jsonb/g) ?? []
    expect(jsonLiterals.length).toBe(45)
    const first = /'((?:[^']|'')*)'::jsonb/.exec(sql)![1].replace(/''/g, "'")
    expect(JSON.parse(first).root.type).toBe('root')
  })

  it('casts enums and carries the draft status through', () => {
    expect(sql).toContain("'published'::enum_faqs_status")
    expect(sql).toContain("'draft'::enum_faqs_status")
    expect(sql).toContain("'en'::enum_faqs_locale")
  })
})
