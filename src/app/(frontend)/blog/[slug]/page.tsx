import { notFound } from 'next/navigation'
import { getLocale } from '@/lib/locale'
import { getDictionary } from '@/lib/i18n'
import Nav from '@/components/Nav'
import PageHero from '@/components/PageHero'
import Footer from '@/components/Footer'
import PostBody from '@/components/PostBody'
import { buildMetadata } from '@/lib/seo'
import { getPostBySlug } from '@/lib/posts'
import { buildBlogPostingJsonLd } from '@/lib/blog-schema'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // Use the active request locale so meta matches what the visitor sees.
  const locale = await getLocale()
  const post = await getPostBySlug(slug, locale).catch(() => null)
  if (!post) return {}
  return buildMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
    image: post.heroImage,
  })
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.blogPage

  const post = await getPostBySlug(slug, locale).catch(() => null)
  if (!post) notFound()

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(t.dateLocale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  const jsonLd = buildBlogPostingJsonLd({
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    heroImage: post.heroImage,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAtPublic ?? post.updatedAt,
  })

  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />

      <PageHero
        headline={post.title}
        subtitle={post.excerpt}
        image={post.heroImage}
        imageAlt={post.heroImageAlt}
      />

      <article
        className="post-article"
        style={{
          background: 'var(--light)',
          padding: 'var(--pad) var(--sectionPadX)',
        }}
      >
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <a href="/blog" className="sp-back">{t.backToBlog}</a>

          <p className="post-meta">
            <time dateTime={post.publishedAt}>
              {t.publishedOn} {fmt(post.publishedAt)}
            </time>
            {post.updatedAtPublic && (
              <>
                {' · '}
                <time dateTime={post.updatedAtPublic}>
                  {t.updatedOn} {fmt(post.updatedAtPublic)}
                </time>
              </>
            )}
          </p>

          <PostBody data={post.body} />

          <nav className="post-footer-links" aria-label={t.footerLinksHeadline}>
            <h3 className="post-footer-links__h serif">{t.footerLinksHeadline}</h3>
            <ul>
              <li><a href="/tickets">{t.footerLinkTickets}</a></li>
              <li><a href="/about">{t.footerLinkAbout}</a></li>
            </ul>
          </nav>
        </div>
      </article>

      <Footer locale={locale} t={dict.footer} />

      <script
        type="application/ld+json"
        // BlogPosting JSON-LD — schema.org BlogPosting per ADR-0003.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  )
}
