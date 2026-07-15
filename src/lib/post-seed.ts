// Pure parser + Lexical builder for seeding the `posts` collection from the
// reviewed blog drafts in `docs/blog-drafts/*.md` (issue #47).
//
// Kept IO-free so it can be unit-tested offline, mirroring src/lib/faq-seed.ts.
// The thin runner `scripts/seed-posts.ts` reads the files and upserts via the
// Payload local API (or emits db/schema/seed-posts.sql for prod).
//
// What is publishable copy vs review scaffolding (agreed in PR #305):
//  - The frontmatter block maps 1:1 to Posts fields (targetKeyword is
//    editorial-only and not stored).
//  - The body's leading `# H1` duplicates the `title` field — dropped.
//  - A blockquote that is the FIRST body block is an internal editorial note
//    (the "HR-izdanje" pointer on the two Croatian posts) — dropped. Quotes
//    later in the body are public copy and kept.
//  - Everything from the `### Sources` / `### Izvori` heading down (citations,
//    "Verify before publishing") is review scaffolding — dropped, along with
//    the `---` rule that precedes it.

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2

export interface SerializedTextNode {
  detail: 0
  format: number
  mode: 'normal'
  style: ''
  text: string
  type: 'text'
  version: 1
}

export interface SerializedLinkNode {
  type: 'link'
  version: 3
  fields: { linkType: 'custom'; newTab: boolean; url: string }
  children: SerializedTextNode[]
  direction: 'ltr'
  format: ''
  indent: 0
}

export type InlineNode = SerializedTextNode | SerializedLinkNode

export interface SerializedParagraphNode {
  children: InlineNode[]
  direction: 'ltr'
  format: ''
  indent: 0
  type: 'paragraph'
  version: 1
  textFormat: 0
}

export interface SerializedHeadingNode {
  children: InlineNode[]
  direction: 'ltr'
  format: ''
  indent: 0
  type: 'heading'
  tag: 'h2' | 'h3'
  version: 1
}

export interface SerializedQuoteNode {
  children: InlineNode[]
  direction: 'ltr'
  format: ''
  indent: 0
  type: 'quote'
  version: 1
}

export interface SerializedListItemNode {
  children: InlineNode[]
  direction: 'ltr'
  format: ''
  indent: 0
  type: 'listitem'
  value: number
  version: 1
}

export interface SerializedListNode {
  children: SerializedListItemNode[]
  direction: 'ltr'
  format: ''
  indent: 0
  type: 'list'
  listType: 'bullet' | 'number'
  start: 1
  tag: 'ul' | 'ol'
  version: 1
}

export type BlockNode =
  | SerializedParagraphNode
  | SerializedHeadingNode
  | SerializedQuoteNode
  | SerializedListNode

export interface SerializedEditorState {
  root: {
    children: BlockNode[]
    direction: 'ltr'
    format: ''
    indent: 0
    type: 'root'
    version: 1
  }
}

export interface PostSeedEntry {
  title: string
  slug: string
  locale: 'en' | 'hr'
  excerpt: string
  heroImage: string
  heroImageAlt: string | null
  /** ISO timestamp from the draft frontmatter (the 1/month cadence). */
  publishedAt: string
  status: 'published' | 'draft'
  /** Plain-text body (for logging/assertions). */
  bodyText: string
  /** Lexical SerializedEditorState for the `body` richText field. */
  body: SerializedEditorState
}

function textNode(text: string, format: number): SerializedTextNode {
  return { detail: 0, format, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function linkNode(text: string, url: string, format: number): SerializedLinkNode {
  // Hard rule (src/proxy.ts): locale is cookie-based; /en- or /hr-prefixed
  // internal URLs 404. Fail the seed loudly rather than publish a dead link.
  if (/^\/(en|hr)(\/|$)/.test(url)) {
    throw new Error(`post-seed: locale-prefixed internal URL "${url}" — these routes 404`)
  }
  return {
    type: 'link',
    version: 3,
    fields: { linkType: 'custom', newTab: false, url },
    children: [textNode(text, format)],
    direction: 'ltr',
    format: '',
    indent: 0,
  }
}

// Tokenise one block's inline markdown into Lexical nodes. Handles
// **bold**, *italic*, [links](url) and the **[bold link](url)** CTA shape used
// by the drafts. No deeper nesting occurs in these files.
export function inlineToNodes(text: string): InlineNode[] {
  const flat = text.replace(/\s*\n\s*/g, ' ').trim()
  const nodes: InlineNode[] = []
  const re =
    /\*\*\[([^\]]+)\]\(([^)]+)\)\*\*|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(flat)) !== null) {
    if (m.index > last) nodes.push(textNode(flat.slice(last, m.index), 0))
    if (m[1] !== undefined) nodes.push(linkNode(m[1], m[2], FORMAT_BOLD))
    else if (m[3] !== undefined) nodes.push(linkNode(m[3], m[4], 0))
    else if (m[5] !== undefined) nodes.push(textNode(m[5], FORMAT_BOLD))
    else nodes.push(textNode(m[6]!, FORMAT_ITALIC))
    last = re.lastIndex
  }
  if (last < flat.length) nodes.push(textNode(flat.slice(last), 0))
  if (nodes.length === 0) nodes.push(textNode('', 0))
  return nodes
}

const BLOCK_DEFAULTS = { direction: 'ltr' as const, format: '' as const, indent: 0 as const }

function paragraph(children: InlineNode[]): SerializedParagraphNode {
  return { ...BLOCK_DEFAULTS, type: 'paragraph', version: 1, textFormat: 0, children }
}

/** True for a line that starts a non-paragraph block (ends paragraph capture). */
function isBlockBoundary(line: string): boolean {
  return /^(#{1,6}\s|-\s|\d+\.\s|>\s?|---\s*$)/.test(line) || line.trim() === ''
}

// Build the Lexical editor state from the draft body markdown (frontmatter
// already removed, footer already cut).
export function bodyToLexical(body: string): SerializedEditorState {
  const lines = body.split('\n')
  const children: BlockNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '' || /^---\s*$/.test(line) || /^#\s/.test(line)) {
      i++
      continue
    }

    const heading = line.match(/^(#{2,3})\s+(.+?)\s*$/)
    if (heading) {
      children.push({
        ...BLOCK_DEFAULTS,
        type: 'heading',
        tag: heading[1] === '##' ? 'h2' : 'h3',
        version: 1,
        children: inlineToNodes(heading[2]),
      })
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const quote: SerializedQuoteNode = {
        ...BLOCK_DEFAULTS,
        type: 'quote',
        version: 1,
        children: inlineToNodes(buf.join(' ')),
      }
      // A quote opening the body is the internal "HR-izdanje" editorial note.
      if (children.length > 0) children.push(quote)
      continue
    }

    const bullet = /^-\s+/.test(line)
    const numbered = /^\d+\.\s+/.test(line)
    if (bullet || numbered) {
      const items: SerializedListItemNode[] = []
      while (i < lines.length && (bullet ? /^-\s+/ : /^\d+\.\s+/).test(lines[i])) {
        items.push({
          ...BLOCK_DEFAULTS,
          type: 'listitem',
          value: items.length + 1,
          version: 1,
          children: inlineToNodes(lines[i].replace(bullet ? /^-\s+/ : /^\d+\.\s+/, '')),
        })
        i++
      }
      children.push({
        ...BLOCK_DEFAULTS,
        type: 'list',
        listType: bullet ? 'bullet' : 'number',
        start: 1,
        tag: bullet ? 'ul' : 'ol',
        version: 1,
        children: items,
      })
      continue
    }

    const buf: string[] = [line]
    i++
    while (i < lines.length && !isBlockBoundary(lines[i])) {
      buf.push(lines[i])
      i++
    }
    children.push(paragraph(inlineToNodes(buf.join(' '))))
  }

  if (children.length === 0) children.push(paragraph([textNode('', 0)]))
  return {
    root: { ...BLOCK_DEFAULTS, type: 'root', version: 1, children },
  }
}

/** Flatten an editor state back to plain text (for logging / assertions). */
export function lexicalPlainText(state: SerializedEditorState): string {
  const inline = (nodes: InlineNode[]): string =>
    nodes.map((n) => (n.type === 'link' ? inline(n.children) : n.text)).join('')
  return state.root.children
    .map((b) => (b.type === 'list' ? b.children.map((li) => inline(li.children)).join(' ') : inline(b.children)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Frontmatter is a flat `key: "quoted value"` block — no YAML lib needed.
function parseFrontmatter(md: string): { fields: Record<string, string>; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) throw new Error('post-seed: draft has no frontmatter block')
  const fields: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*"(.*)"\s*$/)
    if (kv) fields[kv[1]] = kv[2]
  }
  return { fields, body: m[2] }
}

// Cut the review footer: everything from `### Sources` / `### Izvori` down.
function stripFooter(body: string): string {
  return body.replace(/\n###\s+(Sources|Izvori)\b[\s\S]*$/, '')
}

/** Parse one blog draft markdown file into a seed entry. */
export function parsePostDraft(md: string, sourceFile = 'draft'): PostSeedEntry {
  const { fields, body } = parseFrontmatter(md)
  for (const key of ['title', 'slug', 'locale', 'excerpt', 'heroImage', 'publishedAt', 'status']) {
    if (!fields[key]) throw new Error(`post-seed: ${sourceFile} missing frontmatter "${key}"`)
  }
  if (fields.locale !== 'en' && fields.locale !== 'hr')
    throw new Error(`post-seed: ${sourceFile} has unknown locale "${fields.locale}"`)
  if (fields.status !== 'draft' && fields.status !== 'published')
    throw new Error(`post-seed: ${sourceFile} has unknown status "${fields.status}"`)
  if (Number.isNaN(Date.parse(fields.publishedAt)))
    throw new Error(`post-seed: ${sourceFile} has unparseable publishedAt "${fields.publishedAt}"`)

  const publicBody = stripFooter(body)
  // Standing copy rule (docs/copywriting.md): no em-dash in public copy. The
  // drafts only use it inside the (stripped) Sources footers — enforce that.
  if (publicBody.includes('—'))
    throw new Error(`post-seed: ${sourceFile} has an em-dash in the public body`)

  const lexical = bodyToLexical(publicBody)
  // A ⚠️ in the public body marks an unfinished section (post 06's interview
  // placeholders) — never publishable regardless of frontmatter.
  const status: 'published' | 'draft' = publicBody.includes('⚠️')
    ? 'draft'
    : (fields.status as 'published' | 'draft')
  return {
    title: fields.title,
    slug: fields.slug,
    locale: fields.locale as 'en' | 'hr',
    excerpt: fields.excerpt,
    heroImage: fields.heroImage,
    heroImageAlt: fields.heroImageAlt || null,
    publishedAt: fields.publishedAt,
    status,
    bodyText: lexicalPlainText(lexical),
    body: lexical,
  }
}

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/**
 * Emit idempotent seed SQL for db/schema/seed-posts.sql — the PROD publish path.
 *
 * Same rationale as seed-faqs.sql: the prod runtime is a minimal standalone
 * image without the drafts or the Payload CLI, so this SQL is applied by
 * scripts/bootstrap-db.mjs on deploy. Each row is guarded by WHERE NOT EXISTS
 * on (slug, locale) so it inserts once and never clobbers admin edits.
 */
export function toPostsSeedSql(entries: PostSeedEntry[]): string {
  const rows = entries
    .map((e) => {
      const slug = sqlStr(e.slug)
      const alt = e.heroImageAlt === null ? 'NULL' : sqlStr(e.heroImageAlt)
      return (
        `INSERT INTO posts (title, slug, locale, excerpt, hero_image, hero_image_alt, body, published_at, status)\n` +
        `SELECT ${sqlStr(e.title)}, ${slug}, '${e.locale}'::enum_posts_locale, ${sqlStr(e.excerpt)},\n` +
        `  ${sqlStr(e.heroImage)}, ${alt}, ${sqlStr(JSON.stringify(e.body))}::jsonb,\n` +
        `  ${sqlStr(e.publishedAt)}::timestamptz, '${e.status}'::enum_posts_status\n` +
        `WHERE NOT EXISTS (SELECT 1 FROM posts WHERE slug = ${slug} AND locale = '${e.locale}');`
      )
    })
    .join('\n\n')
  const published = entries.filter((e) => e.status === 'published').length
  const draft = entries.length - published
  return (
    `-- Seed the blog (/blog) from the reviewed drafts in docs/blog-drafts/.\n` +
    `-- GENERATED — do not hand-edit; regenerate with:\n` +
    `--   npm run seed:posts -- --emit-sql > db/schema/seed-posts.sql\n` +
    `--\n` +
    `-- Idempotent (INSERT ... WHERE NOT EXISTS on slug+locale): inserts each post\n` +
    `-- once and never clobbers admin edits. ${published} published, ${draft} draft.\n` +
    `-- publishedAt carries the 1/month cadence from the draft frontmatter; the\n` +
    `-- public read filter (status=published AND published_at <= now) makes future\n` +
    `-- posts appear automatically on their date.\n` +
    `-- Sorts after 00-base.sql / app.sql (needs the posts table).\n\n` +
    rows +
    '\n'
  )
}
