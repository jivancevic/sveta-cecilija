import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import type { Locale } from '@/proxy'

export type FaqCategory =
  | 'about'
  | 'story'
  | 'dance'
  | 'music'
  | 'visiting'
  | 'dancers'
  | 'history'

// Display order of the category groupings on /faq.
export const FAQ_CATEGORY_ORDER: FaqCategory[] = [
  'about',
  'story',
  'dance',
  'music',
  'visiting',
  'dancers',
  'history',
]

export interface Faq {
  id: string
  question: string
  answer: unknown // lexical SerializedEditorState
  category: FaqCategory
  locale: Locale
  order: number
}

const PUBLIC_WHERE = (locale: Locale): Where => ({
  and: [{ status: { equals: 'published' } }, { locale: { equals: locale } }],
})

function mapFaq(doc: Record<string, unknown>): Faq {
  return {
    id: String(doc.id),
    question: String(doc.question),
    answer: doc.answer,
    category: (doc.category as FaqCategory) ?? 'about',
    locale: (doc.locale as Locale) ?? 'en',
    order: typeof doc.order === 'number' ? doc.order : 0,
  }
}

/**
 * All published FAQs for a locale, sorted by category order then `order`.
 * Mirrors getPublishedPosts in src/lib/posts.ts.
 */
export async function getPublishedFaqs(locale: Locale, limit = 200): Promise<Faq[]> {
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'faqs',
    where: PUBLIC_WHERE(locale),
    sort: 'order',
    limit,
    depth: 0,
  })
  return res.docs.map((d) => mapFaq(d as Record<string, unknown>))
}

/** Published FAQs grouped by category, in canonical category order. */
export function groupByCategory(faqs: Faq[]): Array<{ category: FaqCategory; items: Faq[] }> {
  return FAQ_CATEGORY_ORDER.map((category) => ({
    category,
    items: faqs
      .filter((f) => f.category === category)
      .sort((a, b) => a.order - b.order),
  })).filter((group) => group.items.length > 0)
}
