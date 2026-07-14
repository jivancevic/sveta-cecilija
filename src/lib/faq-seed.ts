// Pure parser + Lexical builder for seeding the `faqs` collection from the
// reviewed English drafts in `docs/faq-drafts/faq-answers-en.md`.
//
// Kept IO-free so it can be unit-tested offline (the repo's test suite is
// offline by design). The thin runner `scripts/seed-faqs.ts` reads the file
// and upserts via the Payload local API.
//
// Publishing rules baked in here (agreed 2026-07-14):
//  - English only for now (HR is a fast-follow; only EN is crawler-visible).
//  - Every answer is `published` EXCEPT any still carrying a ⚠️ flag (Q49 tour
//    list, pending issue #340) which stays `draft`.
//  - Internal citation tails ("— *sc 2*") and the leading ⚠️ note are stripped;
//    they are review scaffolding, never public copy.

// Mirrors the `category` enum in src/collections/Faqs.ts / the FaqCategory in
// src/lib/faqs.ts. Kept local so this module stays free of the Payload-config
// import chain (so it can be unit-tested offline).
export type FaqCategory =
  | 'about'
  | 'story'
  | 'dance'
  | 'music'
  | 'visiting'
  | 'dancers'
  | 'history'

export const FAQ_SEED_CATEGORIES: FaqCategory[] = [
  'about',
  'story',
  'dance',
  'music',
  'visiting',
  'dancers',
  'history',
]

export interface FaqSeedEntry {
  question: string
  /** Original Croatian question, kept for reference/logging (not stored). */
  croatian: string
  /** Cleaned answer text (citations + ⚠️ note removed), for logging/plain-text. */
  answerText: string
  category: FaqCategory
  order: number
  status: 'published' | 'draft'
  /** Lexical SerializedEditorState for the `answer` richText field. */
  answer: SerializedEditorState
}

// Draft section letter -> collection category enum. The seven A–G sections map
// 1:1 to the seven `category` options in src/collections/Faqs.ts.
const CATEGORY_BY_LETTER: Record<string, FaqCategory> = {
  A: 'about',
  B: 'story',
  C: 'dance',
  D: 'music',
  E: 'visiting',
  F: 'dancers',
  G: 'history',
}

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2

// Minimal subset of Payload's Lexical serialized shape that we emit.
export interface SerializedTextNode {
  detail: 0
  format: number
  mode: 'normal'
  style: ''
  text: string
  type: 'text'
  version: 1
}
export interface SerializedParagraphNode {
  children: SerializedTextNode[]
  direction: 'ltr'
  format: ''
  indent: 0
  type: 'paragraph'
  version: 1
  textFormat: 0
}
export interface SerializedEditorState {
  root: {
    children: SerializedParagraphNode[]
    direction: 'ltr'
    format: ''
    indent: 0
    type: 'root'
    version: 1
  }
}

function textNode(text: string, format: number): SerializedTextNode {
  return { detail: 0, format, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

// Tokenise a single paragraph's inline markdown into Lexical text nodes.
// Handles **bold** and *italic* (no nesting occurs in these drafts). All other
// characters pass through as plain text.
export function inlineToTextNodes(text: string): SerializedTextNode[] {
  const flat = text.replace(/\s*\n\s*/g, ' ').trim()
  const nodes: SerializedTextNode[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(flat)) !== null) {
    if (m.index > last) nodes.push(textNode(flat.slice(last, m.index), 0))
    if (m[1] !== undefined) nodes.push(textNode(m[1], FORMAT_BOLD))
    else nodes.push(textNode(m[2], FORMAT_ITALIC))
    last = re.lastIndex
  }
  if (last < flat.length) nodes.push(textNode(flat.slice(last), 0))
  if (nodes.length === 0) nodes.push(textNode('', 0))
  return nodes
}

// Build a full Lexical editor state from cleaned answer markdown. Blank-line
// separated blocks become paragraphs.
export function answerToLexical(answer: string): SerializedEditorState {
  const paragraphs = answer
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  const children: SerializedParagraphNode[] = (paragraphs.length ? paragraphs : ['']).map(
    (p) => ({
      children: inlineToTextNodes(p),
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'paragraph',
      version: 1,
      textFormat: 0,
    }),
  )
  return {
    root: { children, direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 },
  }
}

// Remove the internal citation tail ("— *sc 2, 8*") from an answer. In these
// drafts the em-dash (U+2014) only ever introduces that tail (prose em-dashes
// were already removed), so cutting from the em-dash to the end is safe.
function stripCitationTail(s: string): string {
  return s.replace(/\s*—\s[\s\S]*$/, '').trim()
}

// Remove a leading "⚠️ *(...)*" review note if present.
function stripLeadingWarning(s: string): string {
  return s.replace(/^⚠️\s*\*\([^)]*\)\*\s*/, '').trim()
}

/**
 * Parse the English FAQ drafts markdown into seed entries.
 * A `### ` heading is treated as a question ONLY when the next non-empty line
 * is the italic `*Q<n>, ...*` original-Croatian line — this excludes the
 * trailing `### Sources` / `### Verification status` housekeeping headings.
 */
export function parseFaqDrafts(md: string): FaqSeedEntry[] {
  const lines = md.split('\n')
  const entries: FaqSeedEntry[] = []
  let category: FaqCategory | null = null
  let order = 0
  let i = 0

  while (i < lines.length) {
    const sec = lines[i].match(/^##\s+([A-G])\.\s+/)
    if (sec) {
      category = CATEGORY_BY_LETTER[sec[1]] ?? null
      i++
      continue
    }
    const q = lines[i].match(/^###\s+(.+?)\s*$/)
    if (q) {
      let j = i + 1
      while (j < lines.length && lines[j].trim() === '') j++
      const cro = (lines[j] ?? '').match(/^\*Q[^,]*,\s*(.+?)\*\s*$/)
      if (!cro || !category) {
        i++
        continue
      }
      let k = j + 1
      const buf: string[] = []
      while (k < lines.length && !/^###\s/.test(lines[k]) && !/^##\s/.test(lines[k]) && !/^---\s*$/.test(lines[k])) {
        buf.push(lines[k])
        k++
      }
      const raw = buf.join('\n').trim()
      const isWarned = raw.includes('⚠️')
      const answerText = stripCitationTail(stripLeadingWarning(raw))
      entries.push({
        question: q[1].trim(),
        croatian: cro[1].trim(),
        answerText,
        category,
        order: order++,
        status: isWarned ? 'draft' : 'published',
        answer: answerToLexical(answerText),
      })
      i = k
      continue
    }
    i++
  }
  return entries
}

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/**
 * Emit idempotent seed SQL for db/schema/seed-faqs.sql — the PROD publish path.
 *
 * The prod runtime is a minimal Next standalone image that does not ship the
 * seed script, the drafts, or the Payload CLI, so `payload run` can't seed prod.
 * Instead this SQL is applied by scripts/bootstrap-db.mjs on every deploy, like
 * db/schema/seed-shows.sql. Each row is guarded by WHERE NOT EXISTS on
 * (question, locale) so it only inserts once and never clobbers admin edits.
 *
 * The `answer` richText is written as a jsonb literal — byte-equivalent to what
 * Payload stores for the field, so /faq renders it identically.
 */
export function toSeedSql(entries: FaqSeedEntry[]): string {
  const rows = entries
    .map((e) => {
      const q = sqlStr(e.question)
      const answer = sqlStr(JSON.stringify(e.answer))
      return (
        `INSERT INTO faqs (question, answer, category, locale, "order", status)\n` +
        `SELECT ${q}, ${answer}::jsonb, '${e.category}'::enum_faqs_category, ` +
        `'en'::enum_faqs_locale, ${e.order}, '${e.status}'::enum_faqs_status\n` +
        `WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE question = ${q} AND locale = 'en');`
      )
    })
    .join('\n\n')
  return (
    `-- Seed the public /faq from the reviewed English drafts\n` +
    `-- (docs/faq-drafts/faq-answers-en.md). GENERATED — do not hand-edit;\n` +
    `-- regenerate with: npm run seed:faqs -- --emit-sql > db/schema/seed-faqs.sql\n` +
    `--\n` +
    `-- Idempotent (INSERT ... WHERE NOT EXISTS on question+locale): inserts each\n` +
    `-- answer once, never clobbers admin edits or re-adds a deleted row's counts.\n` +
    `-- ${entries.filter((e) => e.status === 'published').length} published, ` +
    `${entries.filter((e) => e.status === 'draft').length} draft (Q49 tour list, pending #340). EN only.\n` +
    `-- Sorts after 00-base.sql / migrate-faqs.sql (needs the faqs table).\n\n` +
    rows +
    '\n'
  )
}

/** Flatten a built editor state back to plain text (for logging / assertions). */
export function lexicalPlainText(state: SerializedEditorState): string {
  return state.root.children
    .map((p) => p.children.map((t) => t.text).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
