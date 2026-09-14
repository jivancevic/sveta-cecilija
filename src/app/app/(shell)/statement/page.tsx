import { shortShowDay } from '@/lib/app/partner-screen'
import { loadStatementScreen } from '@/lib/app/statement-data'
import type { StatBar } from '@/lib/partner/partner-stats'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../../AppShell'
import { PartnerNotice } from '../../PartnerNotice'
import { openScreen } from '../../gate'
import { Card, Section } from '../../ui'
import { MonthlyStatement } from './MonthlyStatement'

// `/app/statement` — Obračun (#505), the reseller's statement screen.
//
// The second half of the Backoffice partner dashboard: the season's per-izvedba
// bars and the monthly statement. Both were on one long page under the sell
// form; the route map (#473) splits them, because one is read every day and the
// other once a month.
//
// The season bars are server-rendered divs, not a charting library: twenty-odd
// evenings is twenty-odd rows, and an agency on a hotel desktop should not
// download a chart engine to read them. Every bar is scaled to this partner's
// OWN busiest evening, never to venue capacity, so a small reseller's season
// still has shape.
//
// T1's skin since #574, and the two halves stand side by side on a laptop
// (Q51): the month a reseller is asked about on the left, the season they
// actually had on the right. No route, no figure and no rule moved.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function StatementPage() {
  const { viewer, refusal } = await openScreen('statement')
  if (refusal) return refusal

  const partnerId = viewer.access.kind === 'ok' ? viewer.access.partnerId : null
  const screen = await loadStatementScreen(partnerId)

  if (screen.state.kind !== 'ok') {
    return (
      <AppShell viewer={viewer} screen="statement">
        <PartnerNotice state={screen.state} />
      </AppShell>
    )
  }

  return (
    <AppShell viewer={viewer} screen="statement" title={screen.state.partner.name}>
      <div className="app__cols">
        <MonthlyStatement
          now={screen.now}
          commissionPercent={screen.state.partner.commissionPercent}
        />

        <section className="app__partner-season">
          <Section
            title={APP_STRINGS.statement.seasonTitle}
            aside={APP_STRINGS.statement.seasonSold(screen.totalActive)}
          />
          {screen.totalActive === 0 ? (
            <Card className="app__empty">
              <p>{APP_STRINGS.statement.seasonEmpty}</p>
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

/** One row per season izvedba: adults in gold, children in the paler gold. */
function SeasonBars({ bars }: { bars: StatBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.total))

  return (
    <>
      <p className="app__bars-legend">
        <i className="app__swatch app__swatch--adult" /> {APP_STRINGS.statement.adults}{' '}
        <i className="app__swatch app__swatch--child" /> {APP_STRINGS.statement.children}
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
