import { getLocale } from '@/lib/locale'
import { getDictionary } from '@/lib/i18n'
import Nav from '@/components/Nav'
import PageHero from '@/components/PageHero'
import Footer from '@/components/Footer'
import PostBody from '@/components/PostBody'
import { buildMetadata } from '@/lib/seo'
import { getPublishedFaqs, groupByCategory, type FaqCategory } from '@/lib/faqs'
import { buildFaqPageJsonLd, lexicalToPlainText } from '@/lib/faq-schema'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const dict = await getDictionary('en')
  const t = dict.faqPage
  return buildMetadata({
    title: t.metaTitle,
    description: t.metaDescription,
    path: '/faq',
    image: '/moreska-wide.webp',
  })
}

export default async function FaqPage() {
  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.faqPage

  let faqs: Awaited<ReturnType<typeof getPublishedFaqs>> = []
  try {
    faqs = await getPublishedFaqs(locale)
  } catch {
    // DB unavailable — render empty state rather than 500.
  }

  const groups = groupByCategory(faqs)

  // FAQPage JSON-LD over every published Q&A (answers flattened to plain text).
  const jsonLd = buildFaqPageJsonLd(
    faqs.map((f) => ({
      question: f.question,
      answerText: lexicalToPlainText(f.answer),
    })),
  )

  const categoryLabel = (c: FaqCategory) => t.categories[c]

  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />

      <PageHero
        headline={t.heroHeadline}
        subtitle={t.heroSubtitle}
        image="/moreska-wide.webp"
      />

      <section
        style={{
          background: 'var(--light)',
          padding: 'var(--pad) var(--sectionPadX)',
        }}
      >
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          {groups.length === 0 ? (
            <p className="blog-empty">{t.empty}</p>
          ) : (
            groups.map((group) => (
              <section key={group.category} className="faq-group">
                <h2 className="faq-group__title serif">{categoryLabel(group.category)}</h2>
                <ul className="faq-list">
                  {group.items.map((faq) => (
                    <li key={faq.id} className="faq-item">
                      <details>
                        <summary className="faq-item__q">{faq.question}</summary>
                        <div className="faq-item__a">
                          <PostBody data={faq.answer} />
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </section>

      <Footer locale={locale} t={dict.footer} />

      {faqs.length > 0 && (
        <script
          type="application/ld+json"
          // FAQPage JSON-LD — schema.org FAQPage (docs/geo-strategy.md §4.1).
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
    </div>
  )
}
