import { SITE_URL, BRAND_LAYER, TAGLINE } from '@/lib/seo'
import { SECTION_PAGE_META } from '@/lib/data'
import { getAllPublishedSlugs } from '@/lib/posts'

// EXPERIMENTAL — llms.txt (https://llmstxt.org). A curated, machine-legible
// index of the site for AI answer engines. The standard is NOT officially
// honored by OpenAI, Anthropic, or Google as of early 2026 (see
// docs/geo-strategy.md §4.4) — low cost, speculative payoff. Served as
// text/markdown so an LLM can map the site without crawling every page.
//
// Reachability: /llms.txt is intentionally NOT in robots.ts's disallow list
// (only /admin, /api, /scan, /checkout/*/confirmation are blocked), so
// crawlers may fetch it.

export const dynamic = 'force-dynamic'

const SECTION_LABELS: Record<string, string> = {
  moreska: 'Moreška — the sword dance troupe and the performance itself',
  'wind-orchestra': 'Wind orchestra — the brass band that scores the Moreška',
  klapa: 'Klapa — traditional Dalmatian a-cappella singing',
  choir: 'Choir — the mixed choir of HGD Sveta Cecilija',
}

export async function GET() {
  const abs = (path: string) => `${SITE_URL}${path}`

  const lines: string[] = []
  lines.push(`# Moreška by HGD Sveta Cecilija`)
  lines.push('')
  lines.push(
    `> ${BRAND_LAYER} — ${TAGLINE} HGD Sveta Cecilija is a Croatian cultural society founded in 1883 in Korčula, Croatia, and the institutional steward of the Moreška, a traditional double-sword dance performed in the town since at least 1666. This site is where visitors learn about the dance and buy tickets to see it.`,
  )
  lines.push('')

  lines.push('## Main pages')
  lines.push(`- [Home](${abs('/')}): Overview of the Moreška and HGD Sveta Cecilija.`)
  lines.push(
    `- [Tickets](${abs('/tickets')}): Upcoming performance schedule and ticket purchase (€20 adult, €10 child).`,
  )
  lines.push(`- [About](${abs('/about')}): The history of HGD Sveta Cecilija and the Moreška.`)
  lines.push(`- [FAQ](${abs('/faq')}): Frequently asked questions for visitors.`)
  lines.push('')

  lines.push('## Sections')
  for (const slug of Object.keys(SECTION_PAGE_META)) {
    const label = SECTION_LABELS[slug] ?? slug
    lines.push(`- [${slug}](${abs(`/sections/${slug}`)}): ${label}.`)
  }
  lines.push('')

  // Published blog posts (the corpus an LLM can synthesize richer answers from).
  // Degrade gracefully if the DB is unavailable at request time.
  let slugs: Awaited<ReturnType<typeof getAllPublishedSlugs>> = []
  try {
    slugs = await getAllPublishedSlugs()
  } catch {
    // DB unavailable — omit the blog section rather than 500.
  }
  if (slugs.length > 0) {
    lines.push('## Blog')
    for (const post of slugs) {
      lines.push(`- [${post.slug}](${abs(`/blog/${post.slug}`)})`)
    }
    lines.push('')
  }

  const body = lines.join('\n')
  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  })
}
