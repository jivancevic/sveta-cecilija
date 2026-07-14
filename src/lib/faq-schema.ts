/**
 * Build a schema.org FAQPage JSON-LD object from question/answer pairs.
 * Follows the same conventions as src/lib/blog-schema.ts.
 *
 * Honesty caveat (docs/geo-strategy.md §3): Google deprecated FAQ rich-results
 * for non-gov/health sites in 2023, so this will NOT produce a collapsible Q&A
 * snippet in Google search. Its value is LLM extraction/citation — Q&A is the
 * single most machine-legible content format.
 *
 * The `answerText` must be plain text (Answer.text is a string in schema.org),
 * so richText answers are flattened to text before being passed in.
 */
export interface FaqEntry {
  question: string
  answerText: string
}

export function buildFaqPageJsonLd(entries: FaqEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((e) => ({
      '@type': 'Question',
      name: e.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: e.answerText,
      },
    })),
  }
}

/**
 * Flatten a Payload lexical richText value to plain text for FAQPage
 * Answer.text. Walks the node tree collecting `text` leaves and inserts a
 * single space between block-level nodes. Returns '' for empty/invalid input.
 */
export function lexicalToPlainText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const root = (data as { root?: { children?: unknown[] } }).root
  if (!root || !Array.isArray(root.children)) return ''

  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const n = node as { type?: string; text?: string; children?: unknown[] }
    if (typeof n.text === 'string') parts.push(n.text)
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  for (const child of root.children) {
    walk(child)
    parts.push(' ') // separate block-level nodes
  }
  return parts.join('').replace(/\s+/g, ' ').trim()
}
