import { getLocale } from '@/lib/locale'
import { getDictionary } from '@/lib/i18n'
import Nav from '@/components/Nav'
import PageHero from '@/components/PageHero'
import Footer from '@/components/Footer'
import { buildMetadata } from '@/lib/seo'
import { getPublishedPosts } from '@/lib/posts'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const dict = await getDictionary('en')
  const t = dict.blogPage
  return buildMetadata({
    title: t.metaTitle,
    description: t.metaDescription,
    path: '/blog',
    image: '/moreska-wide.webp',
  })
}

export default async function BlogIndexPage() {
  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.blogPage

  let posts: Awaited<ReturnType<typeof getPublishedPosts>> = []
  try {
    posts = await getPublishedPosts(locale)
  } catch {
    // DB unavailable — render empty state rather than 500.
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(t.dateLocale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

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
        <div style={{ maxWidth: 'var(--maxW)', margin: '0 auto' }}>
          {posts.length === 0 ? (
            <p className="blog-empty">{t.empty}</p>
          ) : (
            <ul className="blog-list">
              {posts.map((post) => (
                <li key={post.id} className="blog-card">
                  <a className="blog-card__link" href={`/blog/${post.slug}`}>
                    <div className="blog-card__media">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={post.heroImage}
                        alt={post.heroImageAlt ?? ''}
                        loading="lazy"
                      />
                    </div>
                    <div className="blog-card__body">
                      <time className="blog-card__date" dateTime={post.publishedAt}>
                        {fmt(post.publishedAt)}
                      </time>
                      <h2 className="blog-card__title serif">{post.title}</h2>
                      <p className="blog-card__excerpt">{post.excerpt}</p>
                      <span className="blog-card__more">{t.readMore} →</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Footer locale={locale} t={dict.footer} />
    </div>
  )
}
