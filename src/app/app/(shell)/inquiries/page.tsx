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
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { Card, Chip, Section } from '../../ui'
import { InquiriesFilter } from './InquiriesFilter'

// `/app/inquiries` — Upiti (#507), the enquiry inbox, in the T1 skin (#570).
//
// Twenty-six enquiries have arrived through the public form and not one of them
// has ever been marked anything, because until now the only place to read one
// was a Payload list view nobody outside the developer opens. So this screen is
// a mailbox, not a table: the unanswered ones at the top, the ones with money
// behind them lifted above the general questions, and a row that is a whole tap
// target opening the enquiry itself.
//
// A row is taller than T1's `ListRow` on purpose and is therefore the screen's
// own shape rather than a shared one: a mailbox row carries a line of the
// message, which is the one thing that tells a reader whether this enquiry is
// worth opening now. Everything else on it — the card, the chips, the rhythm —
// is the system's.
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

      <Section title={S.listTitle} aside={<span aria-live="polite">{foundLabel(total)}</span>} />

      {rows.length === 0 ? (
        <Card className="app__empty">
          <p>{query.state ? S.empty : S.emptyAll}</p>
        </Card>
      ) : (
        <div className="app__inbox">
          {rows.map((inquiry) => {
            const row = inquiryRowView(inquiry)
            return (
              <Link
                key={inquiry.id}
                className={`app__mail${row.isNew ? ' app__mail--new' : ''}`}
                href={row.href}
              >
                <span className="app__mail-head">
                  <b>{row.name}</b>
                  <span className="ui-small">{row.when}</span>
                </span>
                <span className="app__mail-chips">
                  {/* One gold thing per row: the booking, which is the inbox's
                      only opinion. "Novo" is a plain chip because the card's
                      gold edge is already saying it. */}
                  {row.isNew && <Chip>{S.newBadge}</Chip>}
                  {row.booking && <Chip tone="gold">{S.booking}</Chip>}
                  <Chip>{row.type}</Chip>
                </span>
                <span className="app__mail-preview">{row.preview}</span>
              </Link>
            )
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="app__pages" aria-label={S.pageOf(query.page, pages)}>
          {query.page > 1 ? (
            <Link
              className="ui-btn ui-btn--link"
              href={inquiriesHref({ ...query, page: query.page - 1 })}
            >
              {S.previous}
            </Link>
          ) : (
            <span />
          )}
          <span className="ui-small">{S.pageOf(query.page, pages)}</span>
          {query.page < pages ? (
            <Link
              className="ui-btn ui-btn--link"
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
