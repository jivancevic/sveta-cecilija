import Link from 'next/link'
import { can } from '@/lib/access/permissions'
import { getStatsScreen } from '@/lib/app/stats-screen-data'
import type { StatsRow, StatsScreen } from '@/lib/app/stats-screen'
import type { CompMemberTally } from '@/lib/app/comp-screen'
import { shortShowDay } from '@/lib/app/partner-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { TRAJECTORY_CHANNELS, type TrajectoryBar } from '@/lib/dashboard/trajectory'
import type { ChannelMix } from '@/lib/dashboard/channel-mix'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { SeasonPicker } from './SeasonPicker'

// `/app/stats` — Statistika (#508), the season in counts.
//
// Three Backoffice surfaces became one screen: the secretary dashboard's season
// band, its two charts, and the shared `member` login's season table (ADR-0022,
// the page the society's shared account has had since #362). The per-show
// drill-down did NOT come with them — an evening's numbers live on the evening
// itself since #502, which is where every row here links.
//
// **Counts, never money, for everybody.** `tickets`, `season_stats` and
// `finance` all read exactly the same figures; the euro question is Financije
// (#509), decided in #500. The one thing the permission set changes is the
// "gratis po članu" table, which names members and so is `tickets` only, and
// whether a row is a link at all: the shared `member` login unlocks this screen
// and nothing else, so a link into Izvedbe would refuse itself on tap.
//
// Server-rendered throughout, charts included: a season is twenty-odd bars and
// a `<div>` each is cheaper than a chart engine on a phone. The only client
// island is the season `<select>`, because it navigates.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.statistics

/** The y-axis travel of a full-capacity venue, in px. The chart scrolls
 *  sideways rather than growing, so one number sets the whole shape. */
const CHART_HEIGHT = 124

/** The label under each block of the stacked bars, in stack order. */
const CHANNEL_LABEL: Record<(typeof TRAJECTORY_CHANNELS)[number], string> = {
  online: S.channels.online,
  inPerson: S.channels.door,
  partner: S.channels.partner,
  comp: S.channels.comp,
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string | string[] }>
}) {
  const { viewer, refusal } = await openScreen('stats')
  if (refusal) return refusal

  const params = await searchParams
  const requested = Array.isArray(params.season) ? params.season[0] : params.season

  // Two access questions, both asked once and answered in the payload rather
  // than in a template: may this reader open Izvedbe (so a row may be a link),
  // and may they read a member's name (so the comp table is even queried).
  const canOpenPerformances =
    viewer.access.kind === 'ok' && viewer.access.screens.some((s) => s.key === 'performances')
  const canSeeComps = can({ permissions: viewer.permissions }, 'tickets')

  const screen = await getStatsScreen(requested, { canOpenPerformances, canSeeComps })

  // No `season` on the shell: the picker under the header IS the season, and a
  // header line naming the same year one row above a control naming it again
  // reads as two different facts.
  return (
    <AppShell viewer={viewer} screen="stats">
      <SeasonPicker season={screen.season} seasons={screen.seasons} />

      <SeasonBand screen={screen} />

      {screen.rows.length === 0 ? (
        <p className="app__empty">{S.empty}</p>
      ) : (
        <>
          <Trajectory bars={screen.trajectory.bars} maxCapacity={screen.trajectory.maxCapacity} />
          <Performances rows={screen.rows} />
          <ChannelMix mix={screen.mix} />
        </>
      )}

      {screen.comps && <CompsByMember rows={screen.comps} />}
    </AppShell>
  )
}

/** The four figures above the fold, and the season's own fill bar under them. */
function SeasonBand({ screen }: { screen: StatsScreen }) {
  const { band } = screen
  return (
    <section className="app__statband">
      <div className="app__tiles">
        <div className="app__tile2">
          <b>{band.sold}</b>
          <span>{S.sold}</span>
        </div>
        <div className="app__tile2">
          <b>{band.comps}</b>
          <span>{S.comps}</span>
        </div>
        <div className="app__tile2">
          <b>{band.capacity}</b>
          <span>{S.capacity}</span>
        </div>
        <div className="app__tile2">
          <b>{band.percent}%</b>
          <span>{S.fill}</span>
        </div>
      </div>

      <div
        className="app__statband-track"
        role="progressbar"
        aria-label={S.fill}
        aria-valuenow={band.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${band.percent}%` }} />
      </div>

      <p className="app__statnote">{S.cancelledNote}</p>
    </section>
  )
}

/**
 * The season trajectory, moved as-is: one column per evening, chronological,
 * each stacked by where its seats came from and drawn against a faint ceiling
 * that is its own venue's capacity on a scale shared by the whole season. A
 * Ljetno kino sell-out therefore reads taller than a Centar za kulturu one,
 * which is what keeps the comparison honest. A cancelled evening drops to one
 * flat block: its seats no longer mean anything worth splitting apart.
 */
function Trajectory({ bars, maxCapacity }: { bars: TrajectoryBar[]; maxCapacity: number }) {
  return (
    <section className="app__traj">
      <h2 className="app__month-head">
        <span>{S.trajectory}</span>
      </h2>

      <div className="app__traj-scroll">
        {bars.map((bar) => {
          // Pixels, not percentages: the column also carries a count above the
          // bar and a date under it, so a percentage of the column's own height
          // would push a full house past the top of the chart.
          const ceiling = maxCapacity > 0 ? (bar.capacity / maxCapacity) * CHART_HEIGHT : 0
          // Capped at the venue's own ceiling, so an oversold evening never
          // pokes above its capacity line; the segments are then measured per
          // seat against the capped stack and still add up to it.
          const stack = maxCapacity > 0 ? (Math.min(bar.sold, bar.capacity) / maxCapacity) * CHART_HEIGHT : 0
          const perSeat = bar.sold > 0 ? stack / bar.sold : 0

          return (
            <div
              key={bar.id}
              className="app__traj-col"
              title={`${shortShowDay(bar.date)} ${bar.sold}/${bar.capacity}`}
            >
              <span className="app__traj-count">{bar.sold}</span>
              <span className="app__traj-track" style={{ height: ceiling }}>
                {bar.cancelled ? (
                  <i className="app__traj-seg app__traj-seg--cancelled" style={{ height: stack }} />
                ) : (
                  bar.segments
                    .filter((seg) => seg.count > 0)
                    .map((seg) => (
                      <i
                        key={seg.key}
                        className={`app__traj-seg app__traj-seg--${seg.key}`}
                        style={{ height: seg.count * perSeat }}
                      />
                    ))
                )}
              </span>
              <span className="app__traj-date">{shortShowDay(bar.date)}</span>
            </div>
          )
        })}
      </div>

      <Legend keys={[...TRAJECTORY_CHANNELS]} />
    </section>
  )
}

/** One row per evening: what it sold, of what, in what shape. */
function Performances({ rows }: { rows: StatsRow[] }) {
  return (
    <section className="app__statrows">
      <h2 className="app__month-head">
        <span>{S.performances}</span>
      </h2>

      <ul>
        {rows.map((row) => {
          const body = (
            <>
              <span className="app__statrow-head">
                <b>
                  {row.dateLabel} · {row.time}
                </b>
                <span>{row.venueLabel}</span>
              </span>
              <span className="app__statrow-sold">
                {row.soldOf}
                <i>{row.percent}%</i>
              </span>
            </>
          )

          return (
            <li key={row.id} className="app__statrow">
              {row.href ? (
                <Link className="app__statrow-main" href={row.href}>
                  {body}
                </Link>
              ) : (
                <div className="app__statrow-main">{body}</div>
              )}

              <span className="app__statrow-track">
                <i
                  className={row.cancelled ? 'app__statrow-fill app__statrow-fill--off' : 'app__statrow-fill'}
                  style={{ width: `${row.percent}%` }}
                />
              </span>

              <p className="app__statrow-line">
                {S.channels.online} {row.channels.online} · {S.channels.door} {row.channels.door} ·{' '}
                {S.channels.partner} {row.channels.partner} · {S.channels.comp} {row.channels.comp}
              </p>
              <p className="app__statrow-line">
                {S.adults} {row.adult} · {S.children} {row.child} · {S.scanned} {row.scanned}
                {row.cancelled ? ` · ${S.cancelled}` : ''}
              </p>
            </li>
          )
        })}
      </ul>

      <p className="app__statnote">{S.doorNote}</p>
    </section>
  )
}

/**
 * Where the season's seats came from, as one stacked bar. The widths are the
 * raw counts (flex-grow), so the picture is exact even though each legend
 * percent is rounded on its own. Gratis is deliberately not a segment: a comp
 * is a seat and never a sale (ADR-0019), and it has its own figure in the band.
 */
function ChannelMix({ mix }: { mix: ChannelMix }) {
  return (
    <section className="app__mix">
      <h2 className="app__month-head">
        <span>{S.mix}</span>
      </h2>

      {mix.total === 0 ? (
        <p className="app__empty">{S.noSales}</p>
      ) : (
        <>
          <span className="app__mix-track">
            {mix.segments
              .filter((seg) => seg.count > 0)
              .map((seg) => (
                <i
                  key={seg.key}
                  className={`app__traj-seg--${seg.key} app__mix-seg`}
                  style={{ flexGrow: seg.count }}
                />
              ))}
          </span>

          <ul className="app__mix-legend">
            {mix.segments.map((seg) => (
              <li key={seg.key}>
                <i className={`app__swatch app__traj-seg--${seg.key}`} />
                {CHANNEL_LABEL[seg.key]} {seg.count} ({seg.percent}%)
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * Goodwill seats per member (ADR-0019). `tickets` only: it names people.
 *
 * The rows are Gratis's own tally (#506) — the same function, the same season,
 * the same numbers. Its `voided` column is deliberately left off here: a voided
 * comp is something to act on, and acting on it is Gratis's screen.
 */
function CompsByMember({ rows }: { rows: CompMemberTally[] }) {
  return (
    <section className="app__comptable">
      <h2 className="app__month-head">
        <span>{S.compsByMember}</span>
      </h2>

      {rows.length === 0 ? (
        <p className="app__empty">{S.noComps}</p>
      ) : (
        <>
          <p className="app__statnote">{S.compsHint}</p>
          <table className="app__stats-table">
            <thead>
              <tr>
                <th scope="col">{S.member}</th>
                <th scope="col">{S.adults}</th>
                <th scope="col">{S.children}</th>
                <th scope="col">{S.total}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.memberId}>
                  <th scope="row">{row.memberName || '-'}</th>
                  <td>{row.adults}</td>
                  <td>{row.children}</td>
                  <td>{row.issued}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

/** The swatch row both stacked charts share, so one palette teaches both. */
function Legend({ keys }: { keys: (keyof typeof CHANNEL_LABEL)[] }) {
  return (
    <ul className="app__mix-legend">
      {keys.map((key) => (
        <li key={key}>
          <i className={`app__swatch app__traj-seg--${key}`} />
          {CHANNEL_LABEL[key]}
        </li>
      ))}
    </ul>
  )
}
