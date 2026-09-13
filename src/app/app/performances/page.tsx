import Link from 'next/link'
import { can } from '@/lib/access/permissions'
import { getSeasonPerformances } from '@/lib/app/roster-data'
import { loadSeasonSales } from '@/lib/app/sales-data'
import { salesRowView, showsRosterHalf, type PerformanceSales } from '@/lib/app/sales-view'
import {
  countLabel,
  daysUntil,
  groupByMonth,
  pickNextPerformance,
  type RosterPerformance,
} from '@/lib/app/roster-loaders'
import { performancePlace } from '@/lib/app/performance-place'
import {
  APP_STRINGS,
  KIND_LABELS,
  dayOfMonth,
  formatPerformanceDate,
  formatPerformanceDateLong,
  shortWeekday,
} from '@/lib/app/strings'
import { AppShell } from '../AppShell'
import { AttendanceButtons } from '../AttendanceButtons'
import { AddPerformance } from '../PerformanceForm'
import { openScreen } from '../gate'

// `/app/performances` — the Izvedbe screen (#457, ADR-0024; renamed in #495).
//
// The screen answers one question first: where am I next, and am I going. So
// the next live evening gets a hero with the two buttons in it, and the rest of
// the season is the agenda below it, grouped by month. The hero's evening is in
// that agenda too: the list is the whole schedule, not the leftovers.
//
// Everything here is server-rendered except the two answer buttons. The old
// "Nadolazeće | Prošle" toggle is gone: past evenings are a disclosure at the
// bottom, because a dancer opens this app to look forward and the past is
// something they go looking for.
//
// Since #502 it serves the blagajna too, and that is ONE screen rather than a
// second one: a `tickets` holder reads the same agenda in the same order, with
// a sales line under each PUBLIC row (sold of capacity, where the seats came
// from, what is left) and the paused / cancelled / moved badges beside it.
// Somebody who holds `tickets` AND dances sees both halves on the same rows,
// which is the whole reason Izvedbe was never split in two (#476).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** "danas" / "sutra" / "za 5 dana" — the right half of the hero eyebrow. */
function relativeLabel(startMs: number, nowMs: number): string {
  const days = daysUntil(startMs, nowMs)
  if (days <= 0) return APP_STRINGS.home.today
  if (days === 1) return APP_STRINGS.home.tomorrow
  return APP_STRINGS.home.inDays(days)
}

/** "21:00 · Ljetno kino", or "19:30 · Luka · Le Ponant" for a booking. */
function metaLine(p: RosterPerformance): string {
  const where = performancePlace(p)
  return [p.time, where, p.isPublic ? null : p.client].filter(Boolean).join(' · ')
}

function AnswerBadge({ p }: { p: RosterPerformance }) {
  if (p.myAnswer === 'coming') {
    return <span className="app__badge app__badge--yes">{APP_STRINGS.home.answerYes}</span>
  }
  if (p.myAnswer === 'not_coming') {
    return <span className="app__badge app__badge--no">{APP_STRINGS.home.answerNo}</span>
  }
  return <span className="app__badge app__badge--none">{APP_STRINGS.home.answerNone}</span>
}

/**
 * One row of the agenda, the whole of it a link to the evening.
 *
 * A voditelj sees their OWN answer here like anybody else; the headcounts they
 * work from live on the detail page, where there is room for two numbers and a
 * threshold beside each.
 */
function PerformanceRow({
  p,
  badge,
  showAnswer,
  sales,
}: {
  p: RosterPerformance
  badge?: React.ReactNode
  /**
   * False for a viewer with no Member row (a voditelj who does not dance):
   * there is no answer of theirs to report, and "Bez odgovora" on every row
   * would read as a list of things they are late on (#457 review).
   */
  showAnswer: boolean
  /**
   * The blagajna's two lines under the row (#502), or null: a non-public
   * evening has no sales, and a viewer without `tickets` is never handed any.
   */
  sales?: PerformanceSales | null
}) {
  const where = performancePlace(p)
  const view = sales ? salesRowView(sales) : null
  return (
    <Link
      className={`app__row${p.cancelled ? ' app__row--cancelled' : ''}`}
      href={`/app/performances/${p.id}`}
    >
      <span className="app__row-tile">
        <b>{dayOfMonth(p.date)}</b>
        <small>{shortWeekday(p.date)}</small>
      </span>
      <span className="app__row-main">
        <span className="app__row-time">
          {p.time}
          {where && <span>{where}</span>}
        </span>
        <span className="app__row-sub">
          {KIND_LABELS[p.kind]}
          {p.cancelled && ` · ${APP_STRINGS.home.cancelled}`}
        </span>
        {view && (
          <>
            <span className="app__row-sales">
              <b>{view.soldOf}</b>
              <span>{view.remaining}</span>
            </span>
            <span className="app__row-split">{view.split}</span>
            {view.badges.length > 0 && (
              <span className="app__row-flags">
                {view.badges.map((b) => (
                  <span className={`app__flag app__flag--${b.key}`} key={b.key}>
                    {b.label}
                  </span>
                ))}
              </span>
            )}
          </>
        )}
      </span>
      {badge ?? (showAnswer ? <AnswerBadge p={p} /> : <span />)}
    </Link>
  )
}

export default async function PerformancesPage() {
  const { viewer, refusal } = await openScreen('performances')
  if (refusal) return refusal

  const me = viewer.me
  const voditelj = viewer.voditelj
  // The blagajna's half (#502). `can()` over the set the viewer already
  // carries, never a second read and never a role word.
  const blagajna = can({ permissions: viewer.permissions }, 'tickets')

  // One season-wide read, not one per row: the numbers are five aggregates and
  // the alternative is a round trip per evening on the page a secretary opens
  // twenty times a week.
  const [loaded, sales] = await Promise.all([
    getSeasonPerformances({ memberId: me?.id ?? null, voditelj }),
    blagajna ? loadSeasonSales() : Promise.resolve(null),
  ])

  // Who sees a BOOKING (ADR-0024). The roster reads every evening of the
  // season, public or not, because a ship call is an evening a dancer has to
  // turn up for; the blagajna's schedule is the ticketed one, because a booking
  // sells nothing and a row with no numbers on a sales screen is noise. So a
  // viewer who is neither a voditelj nor a dancer gets the public rows only.
  const roster = showsRosterHalf(voditelj, me != null)
  const season = roster
    ? loaded
    : {
        ...loaded,
        upcoming: loaded.upcoming.filter((p) => p.isPublic),
        past: loaded.past.filter((p) => p.isPublic),
      }

  const next = pickNextPerformance(season.upcoming)
  const months = groupByMonth(season.upcoming)
  const lastPast = season.past[0] ?? null

  return (
    <AppShell viewer={viewer} screen="performances" season={season.year}>
      {next ? (
        <section className="app__hero">
          <p className="app__hero-eyebrow">
            {APP_STRINGS.home.next}
            <em>{relativeLabel(next.startMs, season.nowMs)}</em>
          </p>
          <p className="app__hero-date">{formatPerformanceDateLong(next.date)}</p>
          <p className="app__hero-meta">{metaLine(next)}</p>

          <div className="app__hero-tags">
            {next.kind !== 'redovna' && <span className="app__chip">{KIND_LABELS[next.kind]}</span>}
            {next.myArmy && (
              <span className={`app__hero-army app__hero-army--${next.myArmy}`}>
                {next.myArmy === 'crni' ? APP_STRINGS.home.armyCrni : APP_STRINGS.home.armyBili}
              </span>
            )}
            {next.chip && (
              <>
                <span className={`app__chip${next.chip.crni.below ? ' app__chip--low' : ''}`}>
                  {APP_STRINGS.detail.crni} {next.chip.crni.count}/{next.chip.crni.threshold}
                </span>
                <span className={`app__chip${next.chip.bili.below ? ' app__chip--low' : ''}`}>
                  {APP_STRINGS.detail.bili} {next.chip.bili.count}/{next.chip.bili.threshold}
                </span>
              </>
            )}
          </div>

          {next.voditeljNote && (
            <p className="app__note">
              <span className="app__note-label">{APP_STRINGS.card.noteLabel}</span>
              {next.voditeljNote}
            </p>
          )}

          {me && (
            <div className="app__hero-answers">
              <AttendanceButtons
                performanceId={next.id}
                memberId={me.id}
                current={next.myAnswer}
                disabled={!next.canAnswer}
                lockNote={next.canAnswer ? null : APP_STRINGS.answer.locked}
              />
            </div>
          )}

          {/* The missing half of the hero, for a voditelj who dances (#462).
              Their two buttons are absent because `Users.member` is empty, and
              the field is locked to a `users` holder, so until now the only
              repair was somebody else editing the row by hand. The link goes
              where those buttons would be, and stays a quiet line: a voditelj
              who does NOT dance is in a valid state (#419, story 15) and must
              not read this as something they are late on.

              The condition is the RAW link, not `me`, and the screen's is the
              same (#462 review): `me` is also null for a voditelj whose link
              points at a retired Member, and they would be offered a list whose
              every tap is refused. */}
          {voditelj && viewer.memberLinkId === null && (
            <Link className="app__hero-link app__hero-link--link-self" href="/app/account">
              {APP_STRINGS.linkSelf.action} ›
            </Link>
          )}

          <Link className="app__hero-link" href={`/app/performances/${next.id}`}>
            {roster ? APP_STRINGS.home.detailLink : APP_STRINGS.sales.detailLink}
          </Link>
        </section>
      ) : (
        <section className="app__eos">
          {/* Two different pieces of news, and the title has to say which: a
              season that is over names its last evening, one that has not
              started has none to name (#457 review). */}
          <h2>{lastPast ? APP_STRINGS.home.eosTitle : APP_STRINGS.home.eosNothingTitle}</h2>
          <p>
            {lastPast
              ? APP_STRINGS.home.eosBody(formatPerformanceDate(lastPast.date))
              : APP_STRINGS.home.eosNothing}
          </p>
          <Link className="app__button app__button--link" href="/app/leaderboard">
            {APP_STRINGS.home.eosLink}
          </Link>
        </section>
      )}

      {/* "Dodaj izvedbu" (#503, #502): the voditelj's own booking, or the
          blagajna's public evening, entered where the schedule is read. Closed
          until it is asked for, and under the hero rather than over it, because
          the question this screen answers first is still "where am I next". A
          dancer never sees it and the route refuses them anyway. */}
      <AddPerformance canPublic={blagajna} canBooking={voditelj} />

      {months.map((group) => (
        <section className="app__month" key={`${group.year}-${group.month}`}>
          <h2 className="app__month-head">
            {/* The count is of evenings that are still going to happen: a
                cancelled row stays in the list, struck through, but it is not
                one of "4 izvedbe" in September (#457 review). */}
            <span>{group.label}</span>
            <b>{countLabel(group.performances.filter((p) => !p.cancelled).length)}</b>
          </h2>
          {group.performances.map((p) => (
            <PerformanceRow
              key={p.id}
              p={p}
              showAnswer={me != null}
              sales={sales?.get(p.id) ?? null}
            />
          ))}
        </section>
      ))}

      {season.past.length > 0 && (
        <details className="app__past">
          <summary>{APP_STRINGS.home.past(season.past.length)}</summary>
          {season.past.map((p) => (
            <PerformanceRow
              key={p.id}
              p={p}
              showAnswer={me != null}
              sales={sales?.get(p.id) ?? null}
              badge={
                p.lineupConfirmed ? (
                  <span className="app__badge app__badge--lineup">
                    {APP_STRINGS.home.lineupConfirmed}
                  </span>
                ) : (
                  <span />
                )
              }
            />
          ))}
        </details>
      )}
    </AppShell>
  )
}
