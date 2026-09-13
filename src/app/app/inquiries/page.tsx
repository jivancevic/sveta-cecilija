import Link from 'next/link'
import { redirect } from 'next/navigation'
import { loadInquiries } from '@/lib/app/inquiries-data'
import {
  inquiriesHref,
  parseInquiriesQuery,
  INQUIRIES_PER_PAGE,
  type RawSearchParams,
} from '@/lib/app/inquiries-query'
import { foundLabel, inquiryRowView, pageCount } from '@/lib/app/inquiries-view'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { InquiriesFilter } from './InquiriesFilter'

// `/app/inquiries` — Upiti (#507), the enquiry inbox.
//
// Twenty-six enquiries have arrived through the public form and not one of them
// has ever been marked anything, because until now the only place to read one
// was a Payload list view nobody outside the developer opens. So this screen is
// a mailbox, not a table: the unanswered ones at the top, the ones with money
// behind them lifted above the general questions, and a row that is a whole tap
// target opening the enquiry itself.
//
// The order is the seam's (`repo/payload/inquiries-sql.ts`) rather than this
// page's, so it holds across pages instead of only within the one being looked
// at. Everything else is in the URL, the way Narudžbe does it: the filter and
// the page are addresses, so the back button works and a reload keeps the place.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.inquiries

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { viewer, refusal } = await openScreen('inquiries')
  if (refusal) return refusal

  const query = parseInquiriesQuery(await searchParams)
  const { rows, total } = await loadInquiries(query)
  const pages = pageCount(total, INQUIRIES_PER_PAGE)

  // A hand-typed `page=9` on a one-page result would otherwise read "26 upita"
  // over an empty list, which says two contradictory things at once.
  if (query.page > pages && total > 0) redirect(inquiriesHref({ ...query, page: pages }))

  return (
    <AppShell viewer={viewer} screen="inquiries">
      <InquiriesFilter query={query} />

      <p className="app__inquiries-count" aria-live="polite">
        {foundLabel(total)}
      </p>

      {rows.length === 0 ? (
        <p className="app__empty">{query.state ? S.empty : S.emptyAll}</p>
      ) : (
        <div className="app__inquiries-list">
          {rows.map((inquiry) => {
            const row = inquiryRowView(inquiry)
            return (
              <Link
                key={inquiry.id}
                className={`app__inquiry-row${row.isNew ? ' app__inquiry-row--new' : ''}`}
                href={row.href}
              >
                <span className="app__inquiry-head">
                  <span className="app__inquiry-name">{row.name}</span>
                  <span className="app__inquiry-when">{row.when}</span>
                </span>
                <span className="app__inquiry-badges">
                  {row.isNew && <span className="app__badge app__badge--new">{S.newBadge}</span>}
                  {row.booking && (
                    <span className="app__badge app__badge--booking">{S.booking}</span>
                  )}
                  <span className="app__inquiry-type">{row.type}</span>
                </span>
                <span className="app__inquiry-preview">{row.preview}</span>
              </Link>
            )
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="app__inquiries-pager" aria-label={S.pageOf(query.page, pages)}>
          {query.page > 1 ? (
            <Link
              className="app__button app__button--link app__button--quiet"
              href={inquiriesHref({ ...query, page: query.page - 1 })}
            >
              {S.previous}
            </Link>
          ) : (
            <span />
          )}
          <span className="app__inquiries-page">{S.pageOf(query.page, pages)}</span>
          {query.page < pages ? (
            <Link
              className="app__button app__button--link app__button--quiet"
              href={inquiriesHref({ ...query, page: query.page + 1 })}
            >
              {S.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </AppShell>
  )
}
