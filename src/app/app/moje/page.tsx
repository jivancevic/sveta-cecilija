import Link from 'next/link'
import { redirect } from 'next/navigation'
import { accessMember } from '@/lib/app/access'
import { getMySeason } from '@/lib/app/my-season-data'
import type { MySeasonMonth } from '@/lib/app/my-season-loaders'
import { APP_STRINGS, ROLE_LABELS } from '@/lib/app/strings'
import { DANCE_ROLES } from '@/lib/moreskant-profile'
import { resolveAppViewer } from '@/lib/app/viewer'
import { AppShell } from '../AppShell'
import { DeniedPage } from '../DeniedPage'

// `/app/moje` — the Moje tab (#457): one dancer's own season.
//
// Everything on it is a LINEUP fact, never an attendance answer: saying
// "dolazim" moves no number here, the way it moves none on the scoreboard
// (glossary: *Dancer statistics*). That is the whole reason the two screens can
// sit one tab apart without contradicting each other.
//
// The chart is server-rendered SVG rather than a charting library: six to
// twelve bars is a `<rect>` each, and a dancer on a pier should not download a
// chart engine to read them.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHART = { width: 340, height: 124, top: 16, base: 100, gap: 6 }

/** The bars: grey for the season's confirmed evenings, gold for mine. */
function MonthChart({ months }: { months: MySeasonMonth[] }) {
  const max = Math.max(1, ...months.map((m) => m.total))
  const slot = CHART.width / months.length
  const barWidth = Math.max(10, Math.min(34, slot - CHART.gap * 2))
  const scale = (value: number) => ((CHART.base - CHART.top) * value) / max

  return (
    <svg
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      role="img"
      aria-label={APP_STRINGS.mySeason.chartLabel}
      className="app__bars-svg"
    >
      {months.map((m, i) => {
        const x = i * slot + (slot - barWidth) / 2
        const total = scale(m.total)
        const mine = scale(m.mine)
        return (
          <g key={m.month}>
            <rect
              x={x}
              y={CHART.base - total}
              width={barWidth}
              height={total}
              fill="#1f1f1f"
              stroke="#2c2c2c"
            />
            {mine > 0 && (
              <rect x={x} y={CHART.base - mine} width={barWidth} height={mine} fill="#b8881a" />
            )}
            <text x={x + barWidth / 2} y={CHART.base - total - 4} textAnchor="middle" fontSize="11">
              {m.mine}/{m.total}
            </text>
            <text
              x={x + barWidth / 2}
              y={CHART.base + 14}
              textAnchor="middle"
              fontSize="11"
              className="app__bars-axis"
            >
              {m.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default async function MySeasonPage({
  searchParams,
}: {
  searchParams: Promise<{ sezona?: string | string[] }>
}) {
  const viewer = await resolveAppViewer()
  if (!viewer.signedIn) redirect('/app/login')
  if (viewer.access.kind === 'denied') return <DeniedPage />

  const me = accessMember(viewer.access)
  const params = await searchParams
  const requested = Array.isArray(params.sezona) ? params.sezona[0] : params.sezona
  const mine = await getMySeason(requested, me?.id ?? null)

  const roles = DANCE_ROLES.filter((role) => mine.roles[role] > 0)

  return (
    <AppShell me={me} season={mine.season}>
      {/* The season picker: plain links, so the page stays a server render and
          a chosen season is a URL somebody can be sent. */}
      <nav className="app__seasons" aria-label={APP_STRINGS.mySeason.season}>
        {mine.seasons.map((year) => (
          <Link
            key={year}
            href={`/app/moje?sezona=${year}`}
            className={`app__seasons-item${year === mine.season ? ' app__seasons-item--on' : ''}`}
            aria-current={year === mine.season ? 'page' : undefined}
          >
            {year}
          </Link>
        ))}
      </nav>

      {!me && <p className="app__empty">{APP_STRINGS.mySeason.noMember}</p>}

      {me && mine.empty ? (
        <section className="app__eos">
          <h2>{APP_STRINGS.mySeason.emptyTitle}</h2>
          <p>{APP_STRINGS.mySeason.emptyBody}</p>
          <Link className="app__button app__button--link" href="/app">
            {APP_STRINGS.mySeason.emptyLink}
          </Link>
        </section>
      ) : (
        me && (
          <>
            <div className="app__tiles">
              <div className="app__tile2">
                <b>{mine.mine}</b>
                <span>{APP_STRINGS.mySeason.mine}</span>
              </div>
              <div className="app__tile2">
                <b>{mine.confirmedTotal}</b>
                <span>{APP_STRINGS.mySeason.total}</span>
              </div>
              <div className="app__tile2">
                <b>{mine.armyCrni}</b>
                <span>{APP_STRINGS.mySeason.crni}</span>
              </div>
              <div className="app__tile2">
                <b>{mine.armyBili}</b>
                <span>{APP_STRINGS.mySeason.bili}</span>
              </div>
            </div>

            {mine.byMonth.length > 0 && (
              <section className="app__bars">
                <h2 className="app__month-head">
                  <span>{APP_STRINGS.mySeason.byMonth}</span>
                </h2>
                <MonthChart months={mine.byMonth} />
                <p className="app__bars-legend">{APP_STRINGS.mySeason.legend}</p>
              </section>
            )}

            {roles.length > 0 && (
              <section className="app__roles">
                <h2 className="app__month-head">
                  <span>{APP_STRINGS.mySeason.roles}</span>
                </h2>
                {roles.map((role) => (
                  <div className="app__roles-row" key={role}>
                    {ROLE_LABELS[role]}
                    <span>{APP_STRINGS.mySeason.times(mine.roles[role])}</span>
                  </div>
                ))}
              </section>
            )}

            {/* Part 3 (#457): the Ljestvica segment goes here, under the roles. */}
          </>
        )
      )}
    </AppShell>
  )
}
