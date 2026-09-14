import { loadFinanceScreen } from '@/lib/app/finance-data'
import { statementMonths, statementYears } from '@/lib/app/finance-view'
import type { LedgerPerformance, PartnerReceivableRow } from '@/lib/app/finance-view'
import { formatEur } from '@/lib/app/orders-view'
import { pluralize } from '@/lib/app/roster-loaders'
import { APP_STRINGS, formatPerformanceDateLong } from '@/lib/app/strings'
import { VENUE_LABEL } from '@/lib/venues'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { Card, Explain, Seasons, Section } from '../../ui'
import { MonthForm } from './FinancePickers'

// `/app/finance` — Financije (#509), the society's money, in the system skin
// since #571.
//
// The last of the Backoffice money surfaces to move: the season band's two euro
// tiles, the promo panel's revenue column and the partner statement download,
// all of which #500 handed to `finance` and none of which had a home in
// Cecilija. Statistika (#508) is the season in COUNTS and carries no cents on
// purpose; this screen is the other half, and the two never repeat a figure.
//
// **The one rule this screen is built around** (ADR-0015, glossary *Dashboard*):
// prikupljeni prihod and potraživanje od partnera are two facts, in two cards,
// with a sentence under each saying what it is and is not. They are never
// added: the society has no cost data, so a bottom line would be a mislabelled
// gross, and the word "dobit" appears nowhere.
//
// **Every card keeps one sentence and hands the rest to an "i"** (#571, Q46).
// The caveats are the reason the figures are trustworthy and were also longer
// than the figures themselves; `Explain` puts them in a sheet, one tap from the
// number they are about, so nothing is lost and nothing is shouted.
//
// **No buyer appears on it.** Povrati is a count and an amount; whose order it
// was is a question for Narudžbe, which is gated on `tickets` rather than
// `finance` (`finance-no-pii.test.ts` scans this file for the words).
//
// Everything is server-rendered: three query-string values in, one read out.
// The season is a row of links and the month is a form that submits itself;
// that form is the only client code left on the screen.

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
  // A year keeps the month the reader is looking at: the statement picker below
  // is about a month of a partner's sales and has nothing to do with which
  // season the cards above are counting.
  const seasonHref = (year: number) =>
    `/app/finance?season=${year}&year=${screen.month.year}&month=${screen.month.month}`

  return (
    <AppShell viewer={viewer} screen="finance">
      <div className="app__fin">
        <Seasons
          seasons={screen.seasons}
          season={screen.season}
          href={seasonHref}
          label={S.season}
        />

        {/* Card one: cash in hand, with the two halves it is made of. */}
        <Card className="app__fin-card">
          <h2 className="app__fin-head">{S.collectedTitle}</h2>
          <p className="app__fin-figure">{formatEur(money.collectedCents)}</p>
          <dl className="app__fin-split">
            <Split label={S.online} value={formatEur(money.onlineNetCents)} />
            <Split label={S.offline} value={formatEur(money.offlineCents)} />
          </dl>
          <Lead title={S.collectedTitle} note={S.collectedNote} />
        </Card>

        {/* Card two: what went back out. A lost chargeback is one of these
            (#380), which is why the explanation says so out loud. */}
        <Card className="app__fin-card">
          <h2 className="app__fin-head">{S.refundsTitle}</h2>
          <p className="app__fin-figure">{formatEur(money.refundedCents)}</p>
          <p className="app__fin-count">{pluralize(money.refundCount, S.refundsCount)}</p>
          <Lead title={S.refundsTitle} note={S.refundsNote} />
        </Card>

        {/* Card three: money the society has NOT collected. Apart by design: a
            reseller still holds it, and adding it to the first card would report
            euros that are not in the account. The gold edge is the only visual
            difference on the screen and it says exactly that. */}
        <Card className="app__fin-card app__fin-card--apart">
          <h2 className="app__fin-head">{S.receivableTitle}</h2>
          <p className="app__fin-figure">{formatEur(screen.seasonReceivableCents)}</p>
          <p className="app__fin-count">{S.seasonReceivable}</p>
          <Lead title={S.receivableTitle} note={S.receivableNote} />
        </Card>

        <Section title={S.promoTitle} aside={formatEur(promo.totalCents)} />
        <Card className="app__fin-panel">
          <Lead title={S.promoTitle} note={S.promoNote} />
          {promo.rows.length === 0 ? (
            <p className="app__empty">{S.promoEmpty}</p>
          ) : (
            <ul className="app__fin-rows">
              {promo.rows.map((row) => (
                <li key={row.code} className="app__fin-row">
                  <span className="app__fin-row-name">
                    <b>{row.code}</b>
                    {row.memberName !== '' && <i>{row.memberName}</i>}
                  </span>
                  <span className="app__fin-row-sub">
                    {pluralize(row.ticketsSold, S.promoTickets)}
                  </span>
                  <b className="app__fin-num">{formatEur(row.revenueCents)}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Section title={S.monthTitle} aside={formatEur(receivable.totalNetCents)} />
        <Card className="app__fin-panel">
          <p className="app__fin-lead">{S.monthIntro}</p>

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
            <ul className="app__fin-partners">
              {receivable.rows.map((row) => (
                <PartnerRow key={row.partnerId} row={row} month={screen.month} />
              ))}
            </ul>
          )}
        </Card>

        <Section title={S.ledgerTitle} />
        <Card className="app__fin-panel">
          <Lead title={S.ledgerTitle} note={S.ledgerNote} />
          {screen.ledger.length === 0 ? (
            <p className="app__empty">{S.ledgerEmpty}</p>
          ) : (
            screen.ledger.map((evening) => <Evening key={evening.showId} evening={evening} />)
          )}
        </Card>
      </div>
    </AppShell>
  )
}

/**
 * The one sentence a figure keeps, and the "i" that carries the rest (#571).
 *
 * A `div` rather than a `p`, deliberately: `Explain` renders a dialog when it
 * is opened, and a dialog inside a paragraph is markup the browser rewrites
 * under React's feet.
 */
function Lead({ title, note }: { title: string; note: { lead: string; rest: string } }) {
  return (
    <div className="app__fin-lead">
      <span>{note.lead}</span>
      <Explain title={title}>{note.rest}</Explain>
    </div>
  )
}

function Split({ label, value }: { label: string; value: string }) {
  return (
    <div className="app__fin-splitrow">
      <dt>{label}</dt>
      <dd className="app__fin-num">{value}</dd>
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
    <li className="app__fin-partner">
      <div className="app__fin-partner-head">
        <b>
          {row.partnerName}
          {/* A deactivated reseller can no longer sell but can still owe, and
              the badge is how the reader tells "nothing this month" from "gone
              from the channel" without opening the Backoffice. */}
          {!row.active && <i className="app__fin-inactive">{S.inactivePartner}</i>}
        </b>
        <b className="app__fin-num">{formatEur(row.netCents)}</b>
      </div>
      <dl className="app__fin-split">
        <Split label={S.tickets} value={String(row.ticketsSold)} />
        <Split label={S.gross} value={formatEur(row.grossCents)} />
        <Split
          label={`${S.commission} (${row.commissionPercent}%)`}
          value={formatEur(row.commissionCents)}
        />
        <Split label={S.owed} value={formatEur(row.netCents)} />
      </dl>
      {row.cancelledCount > 0 && <p className="app__fin-count">{S.cancelled(row.cancelledCount)}</p>}
      {/* The statement itself, unchanged since #509: the same route, the same
          month, the same file the accountant already knows. */}
      <a className="ui-btn ui-btn--ghost app__fin-csv" href={href}>
        {S.download}
      </a>
    </li>
  )
}

/** One evening's ledger lines, in the order they were written, and its subtotal. */
function Evening({ evening }: { evening: LedgerPerformance }) {
  return (
    <section className="app__fin-evening">
      <h3 className="app__fin-evening-head">
        <span>
          {formatPerformanceDateLong(evening.date)} ·{' '}
          {VENUE_LABEL.hr[evening.venue] ?? evening.venue}
        </span>
        <b className="app__fin-num">{formatEur(evening.revenueCents)}</b>
      </h3>
      <ul className="app__fin-lines">
        {evening.lines.map((line, i) => (
          <li key={i} className="app__fin-line">
            <span className="app__fin-line-what">
              <b className="app__fin-num">{line.quantity}</b> {S.types[line.ticketType]}
              <i>
                {S.sources[line.source]} · {S.unitPrice} {formatEur(line.unitPriceCents)}
              </i>
              {line.discountLabel !== null && (
                <em className="app__fin-discount">{line.discountLabel}</em>
              )}
            </span>
            <b className="app__fin-num">{formatEur(line.quantity * line.unitPriceCents)}</b>
          </li>
        ))}
      </ul>
      <p className="app__fin-subtotal">
        <span>
          {S.ledgerSubtotal} · {S.ledgerSeats(evening.seats)}
        </span>
        <b className="app__fin-num">{formatEur(evening.revenueCents)}</b>
      </p>
    </section>
  )
}
