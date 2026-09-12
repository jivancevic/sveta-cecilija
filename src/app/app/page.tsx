import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { accessMember } from '@/lib/app/access'
import { ONBOARDING_COOKIE, needsOnboarding } from '@/lib/app/onboarding'
import { getSeasonPerformances } from '@/lib/app/roster-data'
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
import { resolveAppViewer } from '@/lib/app/viewer'
import { AppShell } from './AppShell'
import { AttendanceButtons } from './AttendanceButtons'
import { DeniedPage } from './DeniedPage'

// `/app` — the Izvedbe tab (#457, ADR-0024).
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
function PerformanceRow({ p, badge }: { p: RosterPerformance; badge?: React.ReactNode }) {
  const where = performancePlace(p)
  return (
    <Link
      className={`app__row${p.cancelled ? ' app__row--cancelled' : ''}`}
      href={`/app/izvedba/${p.id}`}
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
      </span>
      {badge ?? <AnswerBadge p={p} />}
    </Link>
  )
}

export default async function MoreskantHomePage() {
  const viewer = await resolveAppViewer()
  if (!viewer.signedIn) redirect('/app/login')
  if (viewer.access.kind === 'denied') return <DeniedPage />

  const me = accessMember(viewer.access)
  const voditelj = viewer.access.kind === 'voditelj'

  // The Dobrodošlica is sent from HERE and from nowhere else (#457): every
  // other page under `/app` opens on what it says it is, so a push deep-link
  // into tonight's postava can never land on a walkthrough.
  const jar = await cookies()
  if (
    needsOnboarding({
      signedIn: viewer.signedIn,
      // Already returned above; the rule still states the case, so the one
      // place the decision lives reads as the whole decision.
      denied: false,
      hasMember: me != null,
      cookiePresent: jar.has(ONBOARDING_COOKIE),
    })
  ) {
    redirect('/app/dobrodosli')
  }

  const season = await getSeasonPerformances({ memberId: me?.id ?? null, voditelj })

  const next = pickNextPerformance(season.upcoming)
  const months = groupByMonth(season.upcoming)
  const lastPast = season.past[0] ?? null

  return (
    <AppShell me={me} season={season.year}>
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

          <Link className="app__hero-link" href={`/app/izvedba/${next.id}`}>
            {APP_STRINGS.home.detailLink}
          </Link>
        </section>
      ) : (
        <section className="app__eos">
          <h2>{APP_STRINGS.home.eosTitle}</h2>
          <p>
            {lastPast
              ? APP_STRINGS.home.eosBody(formatPerformanceDate(lastPast.date))
              : APP_STRINGS.home.eosNothing}
          </p>
          <Link className="app__button app__button--link" href="/app/moje">
            {APP_STRINGS.home.eosLink}
          </Link>
        </section>
      )}

      {months.map((group) => (
        <section className="app__month" key={`${group.year}-${group.month}`}>
          <h2 className="app__month-head">
            <span>{group.label}</span>
            <b>{countLabel(group.performances.length)}</b>
          </h2>
          {group.performances.map((p) => (
            <PerformanceRow key={p.id} p={p} />
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
