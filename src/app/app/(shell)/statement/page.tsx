import { can } from '@/lib/access/permissions'
import { shortShowDay } from '@/lib/app/partner-screen'
import { loadStatementScreen, type StatementDocument } from '@/lib/app/statement-data'
import { statementMonths, statementYears } from '@/lib/app/statement-view'
import { APP_STRINGS } from '@/lib/app/strings'
import { amountForPrint } from '@/lib/partner/statement-document'
import type { StatBar } from '@/lib/partner/partner-stats'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { Card, Note, Section } from '../../ui'
import { SentStamp } from './SentStamp'
import { StatementPickers } from './StatementPickers'

// `/app/statement` — Obračun (#505, rebuilt by #599).
//
// **One document, two readers.** A reseller opens it locked to their own
// Partner and reads what they owe. The secretary opens the same screen, picks a
// partner and a month, marks it sent and hands over the PDF. That shared paper
// is the ticket: "usporediti je li sve okej" is impossible while she works from
// a raw CSV and the partner reads a different screen.
//
// **Server-rendered, state in the query string** (`?partnerId=&year=&month=`).
// The month used to be fetched by a client island, so a link to one partner's
// month could not be sent to anybody. Now it can, and the two client pieces
// left are the picker that submits itself and the stamp that posts.
//
// The figures come from `loadPartnerStatement`, the same function the download
// route calls, so what is on screen, what is in the PDF and what is in the
// spreadsheet are one computation — and a month that has been marked sent is
// served frozen on every one of those paths.
//
// The season bars stay what they were: server-rendered divs, not a charting
// library, each scaled to this partner's OWN busiest evening so a small
// reseller's season still has shape.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.statement

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<{
    partnerId?: string | string[]
    year?: string | string[]
    month?: string | string[]
  }>
}) {
  const { viewer, refusal } = await openScreen('statement')
  if (refusal) return refusal

  // `finance` is the secretary's word and the only one that may choose a
  // partner or stamp a month. A reseller holds `partner` and is locked to its
  // own id by the loader, which never reads the query string for it.
  const canPick = can({ permissions: viewer.permissions }, 'finance')
  const ownPartnerId = viewer.access.kind === 'ok' ? viewer.access.partnerId : null

  const params = await searchParams
  const screen = await loadStatementScreen({
    ownPartnerId,
    canPick,
    partnerId: one(params.partnerId),
    year: one(params.year),
    month: one(params.month),
  })

  if (screen.state.kind !== 'ok' || !screen.document) {
    return (
      <AppShell viewer={viewer} screen="statement">
        <Card className="app__col app__partner-notice">
          {screen.state.kind === 'no-partners' ? (
            <p>{S.noPartners}</p>
          ) : (
            <>
              <b>
                {screen.state.kind === 'inactive'
                  ? APP_STRINGS.sell.inactiveTitle
                  : APP_STRINGS.sell.unlinkedTitle}
              </b>
              {screen.state.kind === 'inactive' && (
                <p className="app__partner-name">{screen.state.name}</p>
              )}
              <p>
                {screen.state.kind === 'inactive'
                  ? APP_STRINGS.sell.inactiveBody
                  : APP_STRINGS.sell.unlinkedBody}
              </p>
            </>
          )}
        </Card>
      </AppShell>
    )
  }

  const { document: doc, now } = screen
  const mailHref = screen.mail ? buildMailHref(screen.mail.address, doc) : null

  return (
    <AppShell viewer={viewer} screen="statement" title={screen.state.partner.name}>
      <div className="app__cols">
        <section className="app__statement">
          <Section title={S.monthlyTitle} />
          <Note>{S.monthlyIntro}</Note>

          <StatementPickers
            partners={screen.partners}
            partnerId={screen.state.partner.id}
            year={screen.year}
            years={statementYears(now)}
            month={screen.month}
            months={statementMonths(now, screen.year)}
          />

          <MonthCard doc={doc} />

          <div className="app__statement-actions">
            <a
              className="ui-btn ui-btn--ghost"
              href={downloadHref(screen.state.partner.id, screen.year, screen.month, 'pdf')}
            >
              {S.downloadPdf}
            </a>
            <a
              className="ui-btn ui-btn--ghost"
              href={downloadHref(screen.state.partner.id, screen.year, screen.month, 'csv')}
            >
              {S.downloadCsv}
            </a>
          </div>

          {canPick && (
            <SentStamp
              partnerId={screen.state.partner.id}
              year={screen.year}
              month={screen.month}
              sentAt={screen.sent?.at ?? null}
              monthEnded={screen.monthEnded}
              mailHref={mailHref}
              mailAddress={screen.mail?.address ?? null}
              mailFallback={screen.mail?.fallback ?? false}
            />
          )}
        </section>

        <section className="app__partner-season">
          <Section title={S.seasonTitle} aside={S.seasonSold(screen.totalActive)} />
          {screen.totalActive === 0 ? (
            <Card className="app__empty">
              <p>{S.seasonEmpty}</p>
            </Card>
          ) : (
            <Card>
              <SeasonBars bars={screen.bars} />
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  )
}

/** The download route, in whichever form. Same route the screen read from. */
function downloadHref(partnerId: string, year: number, month: number, format: string): string {
  return (
    `/api/partner/reconciliation?partnerId=${encodeURIComponent(partnerId)}` +
    `&year=${year}&month=${month}&format=${format}`
  )
}

/**
 * The covering message, already written.
 *
 * Built on the SERVER so the subject, the period and the amount come off the
 * document rather than off whatever the browser happened to render — a mail
 * that names one figure and an attachment that carries another is the one
 * failure this handover cannot afford.
 */
function buildMailHref(address: string, doc: StatementDocument): string {
  const subject = S.sent.mailSubject(doc.partner.name, doc.monthLabel)
  const body = S.sent.mailBody(
    doc.partner.name,
    doc.monthLabel,
    `${amountForPrint(doc.totals.netCents)} €`,
  )
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/**
 * One month, as the document states it: the period it covers, one row per
 * izvedba, and the three figures the invoice is raised from.
 *
 * The storno line sits under the total with its own "not included" note, and it
 * is never added to anything. That is the document's rule and it is worth
 * repeating here: the račun is raised against *Za uplatu HGD-u*, so a void that
 * leaked into a sum would bill the partner for a seat they gave back.
 */
function MonthCard({ doc }: { doc: StatementDocument }) {
  return (
    <Card>
      <p className="app__statement-period">
        <span>{S.periodLabel}</span> <b>{S.periodValue(doc.periodLabel)}</b>
      </p>

      <dl className="app__statement-figures">
        <Figure label={S.tickets} value={String(doc.totals.tickets)} />
        <Figure label={S.gross} value={`${amountForPrint(doc.totals.grossCents)} €`} />
        <Figure
          label={S.commission(doc.commissionPercent)}
          value={`${amountForPrint(doc.totals.commissionCents)} €`}
        />
        <Figure label={S.owed} value={`${amountForPrint(doc.totals.netCents)} €`} strong />
      </dl>

      {doc.lines.length === 0 ? (
        <p className="app__statement-loading">{S.empty}</p>
      ) : (
        <ul className="app__statement-shows">
          <li className="app__statement-show app__statement-show--head">
            <span>{S.perShow}</span>
            <b>{S.gross}</b>
          </li>
          {doc.lines.map((line) => (
            <li key={line.showId} className="app__statement-show">
              <span>
                {line.date} · {line.venue} · {line.tickets}
              </span>
              <b>{amountForPrint(line.grossCents)} €</b>
            </li>
          ))}
        </ul>
      )}

      {doc.cancelled.count > 0 && (
        <p className="app__statement-cancelled">
          {S.cancelledLine(doc.cancelled.count, `${amountForPrint(doc.cancelled.cents)} €`)}{' '}
          <i>{S.cancelledNote}</i>
        </p>
      )}
    </Card>
  )
}

function Figure({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className={strong ? 'app__figure app__figure--strong' : 'app__figure'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** One row per season izvedba: adults in gold, children in the paler gold. */
function SeasonBars({ bars }: { bars: StatBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.total))

  return (
    <>
      <p className="app__bars-legend">
        <i className="app__swatch app__swatch--adult" /> {S.adults}{' '}
        <i className="app__swatch app__swatch--child" /> {S.children}
      </p>
      <ul className="app__statbars">
        {bars.map((bar) => (
          <li key={bar.showId} className="app__statbar">
            <span className="app__statbar-date">{shortShowDay(bar.showDate)}</span>
            <span className="app__statbar-track">
              <i className="app__statbar-adults" style={{ width: `${(bar.adults / max) * 100}%` }} />
              <i
                className="app__statbar-children"
                style={{ width: `${(bar.children / max) * 100}%` }}
              />
            </span>
            <span className="app__statbar-total">{bar.total}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
