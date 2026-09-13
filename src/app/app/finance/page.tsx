import { loadFinanceScreen } from '@/lib/app/finance-data'
import { statementMonths, statementYears } from '@/lib/app/finance-view'
import type { LedgerPerformance, PartnerReceivableRow } from '@/lib/app/finance-view'
import { formatEur } from '@/lib/app/orders-view'
import { pluralize } from '@/lib/app/roster-loaders'
import { APP_STRINGS, formatPerformanceDateLong } from '@/lib/app/strings'
import { VENUE_LABEL } from '@/lib/venues'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { MonthForm, SeasonForm } from './FinancePickers'

// `/app/finance` — Financije (#509), the society's money.
//
// The last of the Backoffice money surfaces to move: the season band's two euro
// tiles, the promo panel's revenue column and the partner statement download,
// all of which #500 handed to `finance` and none of which had a home in
// Cecilija. Statistika (#508) is the season in COUNTS and carries no cents on
// purpose; this screen is the other half, and the two never repeat a figure.
//
// **The one rule this screen is built around** (ADR-0015, glossary *Dashboard*):
// prikupljeni prihod and potraživanje od partnera are two facts, in two cards,
// with a sentence between them saying they are not added. The society has no
// cost data, so a bottom line would be a mislabelled gross, and the word
// "dobit" appears nowhere.
//
// **No buyer appears on it.** Povrati is a count and an amount; whose order it
// was is a question for Narudžbe, which is gated on `tickets` rather than
// `finance` (`finance-no-pii.test.ts` scans this file for the words).
//
// Everything is server-rendered: three query-string values in, one read out.
// The two pickers are the only client code, and only so a select can submit
// itself.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.finance

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string | string[]
    year?: string | string[]
    month?: string | string[]
  }>
}) {
  const { viewer, refusal } = await openScreen('finance')
  if (refusal) return refusal

  const params = await searchParams
  const screen = await loadFinanceScreen({
    season: one(params.season),
    year: one(params.year),
    month: one(params.month),
  })

  const { money, receivable, promo } = screen

  return (
    <AppShell viewer={viewer} screen="finance">
      <SeasonForm
        season={screen.season}
        seasons={screen.seasons}
        year={screen.month.year}
        month={screen.month.month}
      />

      {/* Card one: cash in hand, with the two halves it is made of. */}
      <section className="app__finance-card">
        <h2 className="app__finance-head">{S.collectedTitle}</h2>
        <p className="app__finance-figure">{formatEur(money.collectedCents)}</p>
        <dl className="app__finance-split">
          <Split label={S.online} value={formatEur(money.onlineNetCents)} />
          <Split label={S.offline} value={formatEur(money.offlineCents)} />
        </dl>
        <p className="app__finance-note">{S.collectedNote}</p>
      </section>

      {/* Card two: what went back out. A lost chargeback is one of these
          (#380), which is why the note says so out loud. */}
      <section className="app__finance-card">
        <h2 className="app__finance-head">{S.refundsTitle}</h2>
        <p className="app__finance-figure">{formatEur(money.refundedCents)}</p>
        <p className="app__finance-count">{pluralize(money.refundCount, S.refundsCount)}</p>
        <p className="app__finance-note">{S.refundsNote}</p>
      </section>

      {/* Card three: money the society has NOT collected. Apart by design: a
          reseller still holds it, and adding it to the first card would report
          euros that are not in the account. */}
      <section className="app__finance-card app__finance-card--apart">
        <h2 className="app__finance-head">{S.receivableTitle}</h2>
        <p className="app__finance-figure">{formatEur(screen.seasonReceivableCents)}</p>
        <p className="app__finance-count">{S.seasonReceivable}</p>
        <p className="app__finance-note">{S.receivableNote}</p>
      </section>

      <section className="app__finance-panel">
        <h2 className="app__month-head">
          <span>{S.promoTitle}</span>
          <b className="app__finance-num">{formatEur(promo.totalCents)}</b>
        </h2>
        <p className="app__finance-note">{S.promoNote}</p>
        {promo.rows.length === 0 ? (
          <p className="app__empty">{S.promoEmpty}</p>
        ) : (
          <ul className="app__finance-rows">
            {promo.rows.map((row) => (
              <li key={row.code} className="app__finance-row">
                <span className="app__finance-row-name">
                  <b>{row.code}</b>
                  {row.memberName !== '' && <i>{row.memberName}</i>}
                </span>
                <span className="app__finance-row-sub">
                  {pluralize(row.ticketsSold, S.promoTickets)}
                </span>
                <b className="app__finance-num">{formatEur(row.revenueCents)}</b>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="app__finance-panel">
        <h2 className="app__month-head">
          <span>{S.monthTitle}</span>
          <b className="app__finance-num">{formatEur(receivable.totalNetCents)}</b>
        </h2>
        <p className="app__finance-note">{S.monthIntro}</p>

        <MonthForm
          season={screen.season}
          year={screen.month.year}
          years={statementYears(screen.now)}
          month={screen.month.month}
          months={statementMonths(screen.now, screen.month.year)}
        />

        {receivable.rows.length === 0 ? (
          <p className="app__empty">{S.noPartners}</p>
        ) : (
          <ul className="app__finance-partners">
            {receivable.rows.map((row) => (
              <PartnerRow key={row.partnerId} row={row} month={screen.month} />
            ))}
          </ul>
        )}
      </section>

      <section className="app__finance-panel">
        <h2 className="app__month-head">
          <span>{S.ledgerTitle}</span>
        </h2>
        <p className="app__finance-note">{S.ledgerNote}</p>
        {screen.ledger.length === 0 ? (
          <p className="app__empty">{S.ledgerEmpty}</p>
        ) : (
          screen.ledger.map((evening) => <Evening key={evening.showId} evening={evening} />)
        )}
      </section>
    </AppShell>
  )
}

function Split({ label, value }: { label: string; value: string }) {
  return (
    <div className="app__finance-splitrow">
      <dt>{label}</dt>
      <dd className="app__finance-num">{value}</dd>
    </div>
  )
}

/**
 * One partner's month: what it sold, what it keeps and what it owes, with the
 * CSV of the same month behind the link. The figures and the file come from
 * one query (`/api/partner/reconciliation`), so they cannot disagree.
 */
function PartnerRow({
  row,
  month,
}: {
  row: PartnerReceivableRow
  month: { year: number; month: number }
}) {
  const href =
    `/api/partner/reconciliation?partnerId=${encodeURIComponent(row.partnerId)}` +
    `&year=${month.year}&month=${month.month}&format=csv`

  return (
    <li className="app__finance-partner">
      <div className="app__finance-partner-head">
        <b>
          {row.partnerName}
          {/* A deactivated reseller can no longer sell but can still owe, and
              the badge is how the reader tells "nothing this month" from "gone
              from the channel" without opening the Backoffice. */}
          {!row.active && <i className="app__finance-inactive">{S.inactivePartner}</i>}
        </b>
        <b className="app__finance-num">{formatEur(row.netCents)}</b>
      </div>
      <dl className="app__finance-split">
        <Split label={S.tickets} value={String(row.ticketsSold)} />
        <Split label={S.gross} value={formatEur(row.grossCents)} />
        <Split
          label={`${S.commission} (${row.commissionPercent}%)`}
          value={formatEur(row.commissionCents)}
        />
        <Split label={S.owed} value={formatEur(row.netCents)} />
      </dl>
      {row.cancelledCount > 0 && (
        <p className="app__finance-count">{S.cancelled(row.cancelledCount)}</p>
      )}
      <a className="app__button app__button--link app__finance-csv" href={href}>
        {S.download}
      </a>
    </li>
  )
}

/** One evening's ledger lines, in the order they were written, and its subtotal. */
function Evening({ evening }: { evening: LedgerPerformance }) {
  return (
    <section className="app__finance-evening">
      <h3 className="app__finance-evening-head">
        <span>
          {formatPerformanceDateLong(evening.date)} · {VENUE_LABEL.hr[evening.venue] ?? evening.venue}
        </span>
        <b className="app__finance-num">{formatEur(evening.revenueCents)}</b>
      </h3>
      <ul className="app__finance-lines">
        {evening.lines.map((line, i) => (
          <li key={i} className="app__finance-line">
            <span className="app__finance-line-what">
              <b className="app__finance-num">{line.quantity}</b> {S.types[line.ticketType]}
              <i>
                {S.sources[line.source]} · {S.unitPrice} {formatEur(line.unitPriceCents)}
              </i>
              {line.discountLabel !== null && (
                <em className="app__finance-discount">{line.discountLabel}</em>
              )}
            </span>
            <b className="app__finance-num">
              {formatEur(line.quantity * line.unitPriceCents)}
            </b>
          </li>
        ))}
      </ul>
      <p className="app__finance-subtotal">
        <span>
          {S.ledgerSubtotal} · {S.ledgerSeats(evening.seats)}
        </span>
        <b className="app__finance-num">{formatEur(evening.revenueCents)}</b>
      </p>
    </section>
  )
}
