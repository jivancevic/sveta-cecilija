import { getPayload } from 'payload'
import config from '@payload-config'
import { getLocale } from '@/lib/locale'
import { getDictionary } from '@/lib/i18n'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { resolveOptOut } from '@/lib/review-consent/review-consent'

export const dynamic = 'force-dynamic'

// Public unsubscribe landing for the post-show review email (#148). The token
// in the URL is the per-order opt-out token; resolving it sets
// orders.review_opt_out so the dispatcher skips that order. Idempotent — a
// re-click still lands on the confirmation. An unknown token shows a neutral
// "couldn't find it" message without leaking whether the token existed.
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.unsubscribePage

  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as {
    pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
  }).pool

  const result = await resolveOptOut(token, {
    markOptedOut: async (tok) => {
      const r = await pool.query(
        `UPDATE orders SET review_opt_out = true, updated_at = NOW()
         WHERE review_opt_out_token = $1
         RETURNING id`,
        [tok],
      )
      return r.rows.length > 0
    },
  })

  const ok = result === 'OK'

  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />
      <main>
        <section className="legal-page__content">
          <div className="legal-page__inner">
            <h1 className="legal-page__h serif">{ok ? t.okTitle : t.notFoundTitle}</h1>
            <p className="legal-page__p">{ok ? t.okBody : t.notFoundBody}</p>
          </div>
        </section>
      </main>
      <Footer locale={locale} t={dict.footer} />
    </div>
  )
}
