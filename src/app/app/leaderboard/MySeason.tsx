import Link from 'next/link'
import { MILESTONES } from '@/lib/app/leaderboard-loaders'
import type { MySeason as MySeasonData, MySeasonMonth } from '@/lib/app/my-season-loaders'
import { pluralForm, pluralize } from '@/lib/app/roster-loaders'
import { APP_STRINGS, KIND_LABELS, ROLE_LABELS } from '@/lib/app/strings'
import { DANCE_ROLES } from '@/lib/moreskant-profile'
import { PERFORMANCE_KINDS, type PerformanceKind } from '@/lib/show-performance'
import { Card, Chip, CountUp, List, ListRow, Section } from '../ui'

// "Moja sezona", the second panel of Ljestvica (#457, reskinned in #568).
//
// One dancer's own year: what they danced, which prekretnice it passed, what
// kind of evenings they were, which roles, and the shape of it month by month.
// Everything on it is a LINEUP fact, never an attendance answer: saying
// "dolazim" moves no number here, the way it moves none on the board next to it
// (glossary: *Dancer statistics*).
//
// **No streaks**, here or anywhere, and that is a decision rather than an
// omission (glossary: *Ljestvica*): a dancer who missed an evening for a shift
// at work has not broken anything, and a counter that says they did is a
// counter that makes people answer "dolazim" to protect a number.
//
// A voditelj with no Member row has not "failed to dance": there is no dancer
// to count (#457 review). So the panel says what is missing and then shows the
// SEASON's two numbers, which are facts they can use.

const S = APP_STRINGS.mySeason

const CHART = { width: 340, height: 124, top: 16, base: 100, gap: 6 }

/** The bars: the season's confirmed evenings in the sunk tone, mine in gold. */
function MonthChart({ months }: { months: MySeasonMonth[] }) {
  const max = Math.max(1, ...months.map((m) => m.total))
  const slot = CHART.width / months.length
  const barWidth = Math.max(10, Math.min(34, slot - CHART.gap * 2))
  const scale = (value: number) => ((CHART.base - CHART.top) * value) / max

  return (
    <svg
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      role="img"
      aria-label={S.chartLabel}
      className="app__bars-svg"
    >
      {months.map((m, i) => {
        const x = i * slot + (slot - barWidth) / 2
        const total = scale(m.total)
        const mine = scale(m.mine)
        return (
          <g key={m.month}>
            {/* Tokens, not hexes: the night skin re-points `--sunk` and
                `--gold`, and a hex would stay on paper while the page moved. */}
            <rect
              x={x}
              y={CHART.base - total}
              width={barWidth}
              height={total}
              rx="3"
              fill="var(--sunk)"
            />
            {mine > 0 && (
              <rect
                x={x}
                y={CHART.base - mine}
                width={barWidth}
                height={mine}
                rx="3"
                fill="var(--gold)"
              />
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

/** One figure of the season, inside the card that carries the four of them. */
function Figure({ value, label, up = false }: { value: number; label: string; up?: boolean }) {
  return (
    <div className="app__lb-fig">
      <b>{up ? <CountUp value={value} /> : value}</b>
      <span>{label}</span>
    </div>
  )
}

export interface MySeasonMilestones {
  /** The milestones already reached, a subset of MILESTONES. */
  reached: number[]
  /** The next one, or null when all four are behind the reader. */
  next: number | null
  /** Danced every confirmed evening of the season. */
  fullSeason: boolean
}

export function MySeason({
  mine,
  hasMember,
  milestones,
  byKind,
}: {
  mine: MySeasonData
  /** The reader's account is linked to a Member: there is a dancer to count. */
  hasMember: boolean
  milestones: MySeasonMilestones | null
  /** The reader's own season split by kind of evening; null without a Member. */
  byKind: Record<PerformanceKind, number> | null
}) {
  if (!hasMember) {
    return (
      <>
        <Card className="app__lb-nomember">
          <b>{S.noMember}</b>
          <p>{S.noMemberBody}</p>
        </Card>
        <Card className="app__lb-figs">
          <Figure value={mine.confirmedTotal} label={S.seasonTotal} />
          <Figure value={mine.byMonth.length} label={S.seasonMonths} />
        </Card>
      </>
    )
  }

  if (mine.empty) {
    return (
      <Card className="app__empty">
        <h2>{S.emptyTitle}</h2>
        <p>{S.emptyBody}</p>
        {/* Moreška, not Izvedbe (#565): the reader is a dancer with no confirmed
            postava yet, and answering is done on the dancer's own screen. */}
        <Link className="ui-btn ui-btn--link" href="/app/moreska">
          {S.emptyLink}
        </Link>
      </Card>
    )
  }

  const roles = DANCE_ROLES.filter((role) => mine.roles[role] > 0)
  const kinds = byKind
    ? PERFORMANCE_KINDS.filter((kind) => byKind[kind] > 0)
    : []

  return (
    <>
      <Card className="app__lb-figs">
        <Figure value={mine.mine} label={S.mine} up />
        <Figure value={mine.confirmedTotal} label={S.total[pluralForm(mine.confirmedTotal)]} />
        <Figure value={mine.armyCrni} label={S.crni} />
        <Figure value={mine.armyBili} label={S.bili} />
      </Card>

      {milestones && (
        <section className="app__lb-group">
          <Section title={S.milestones} />
          <Card className="app__lb-milestones">
            <div className="app__lb-marks">
              {MILESTONES.map((m) => {
                const done = milestones.reached.includes(m)
                return (
                  <span
                    key={m}
                    className={`app__lb-mark${done ? ' app__lb-mark--on' : ''}`}
                    title={done ? S.milestoneReached(m) : S.milestoneAhead(m)}
                  >
                    {m}
                  </span>
                )
              })}
              {milestones.fullSeason && <Chip tone="gold">{APP_STRINGS.board.fullSeason}</Chip>}
            </div>
            {milestones.next !== null && (
              <p className="app__lb-next">
                {APP_STRINGS.board.nextMilestone(
                  pluralize(milestones.next, APP_STRINGS.moreska.count),
                )}
              </p>
            )}
          </Card>
        </section>
      )}

      {kinds.length > 0 && byKind && (
        <section className="app__lb-group">
          <Section title={S.byKind} />
          <List>
            {kinds.map((kind) => (
              <ListRow key={kind} title={KIND_LABELS[kind]} trail={<b>{byKind[kind]}</b>} />
            ))}
          </List>
        </section>
      )}

      {roles.length > 0 && (
        <section className="app__lb-group">
          <Section title={S.roles} />
          <List>
            {roles.map((role) => (
              <ListRow
                key={role}
                title={ROLE_LABELS[role]}
                trail={<b>{S.times(mine.roles[role])}</b>}
              />
            ))}
          </List>
        </section>
      )}

      {mine.byMonth.length > 0 && (
        <section className="app__lb-group">
          <Section title={S.byMonth} />
          <Card>
            <MonthChart months={mine.byMonth} />
            <p className="app__bars-legend">{S.legend}</p>
          </Card>
        </section>
      )}
    </>
  )
}
