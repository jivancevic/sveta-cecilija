import Link from 'next/link'
import { getSeasonPerformances } from '@/lib/app/roster-data'
import { groupByMonth, pickHeroPerformances } from '@/lib/app/roster-loaders'
import {
  aheadLabel,
  heroView,
  identityOf,
  monthSections,
  type NastupRow,
} from '@/lib/app/moreska-screen'
import { APP_STRINGS, formatPerformanceDate } from '@/lib/app/strings'
import { zagrebToday } from '@/lib/app/home-screen'
import { Card, Chip, DateDisc, Hero, List, ListRow, Note, RoleMark, Section } from '../../ui'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { Answer } from './Answer'
import { StateBar } from './StateBar'
import { HeroHalves } from '../../HeroHalves'
import { HeroMeta } from '../../HeroMeta'
import { HeroEyebrow } from '../../HeroEyebrow'

// `/app/moreska` — Moreška, the dancer's register screen (#565).
//
// The screen answers one question and then gets out of the way: where am I
// next, and am I going. So the next live nastup is a hero with the day at 80px
// and the two buttons in it, the two armies are a bar under it that taps into
// Stanje, and the rest of the season is the agenda below, a month at a time.
// The hero's evening is in that agenda too: the list is the whole schedule, not
// the leftovers.
//
// **What is deliberately NOT here** (the ticket's decisions):
//
//   - no seat count, no revenue, no capacity anywhere (Q29). Those belong to
//     the blagajna and live on Izvedbe, which since #565 a `moreskant` does not
//     unlock at all.
//   - no "Dodaj" (Q31). A performance is created on Izvedbe, by the voditelj or
//     the blagajna, and the route refuses a dancer anyway.
//   - no client and no kind name on a non-regular evening: it reads "Vanredna",
//     or "Experience" for the one kind that is a form of its own (Q30, widened
//     by #591; glossary *Vanredna izvedba*, *Moreška Experience*).
//
// Everything is server-rendered except the two answer buttons and the bar's
// tap. Data comes through the seam (`getSeasonPerformances` → `getRepo()`), and
// what the rows SAY is decided by `lib/app/moreska-screen.ts`, which is pure
// and tested without a database.
//
// A voditelj who does not dance (#419, story 15) reads this screen too: they
// unlock it through `moreska`, they get the schedule and the bar, and one quiet
// line says why there is no answer of theirs on it.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.moreska

export default async function MoreskaPage() {
  const { viewer, refusal } = await openScreen('moreska')
  if (refusal) return refusal

  const me = viewer.me
  const season = await getSeasonPerformances({
    memberId: me?.id ?? null,
    voditelj: viewer.voditelj,
    // The hero's ArmyBar: "are we enough tonight" is a question the whole
    // roster reads, not only its lead (ADR-0024, visibility is society-wide).
    armyCounts: true,
  })

  // ONE clock for the whole screen, and it is the LOADER's (`season.nowMs`, the
  // instant the upcoming/past split was taken). Two reasons, and both are
  // rules rather than taste: a server component may not read the wall clock
  // during render, and the honest reference point for "danas" is the same one
  // that decided which side of the split this evening fell on. A second
  // `Date.now()` here could put the hero's DANAS and the row's countdown on
  // opposite sides of midnight.
  const today = zagrebToday(season.nowMs)

  const pick = pickHeroPerformances(season.upcoming)
  const next = pick?.first ?? null
  const ahead = aheadLabel(season.upcoming)
  // The identity block is a PROFILE (#612): the big disc is the reader's own
  // primary role, the small ones are the rest of what they dance, and the
  // evening's title is drawn where a person is shown IN an evening — the hero
  // below, and Stanje (glossary: *Title*, unchanged).
  const identity = identityOf(me, ahead)
  const months = monthSections(groupByMonth(season.upcoming), {
    showAnswer: me != null,
    today,
  })
  // The past is already most recent first (`splitBySeason`), so grouping it
  // reuses the upcoming list's own function and comes out newest month first
  // with the newest evening at the top of each: a second, descending grouper
  // would be a second place for "which month is this row in" to be decided.
  const pastMonths = monthSections(groupByMonth(season.past), { showAnswer: false })
  const hero = pick ? heroView(pick, { today }) : null
  const lastPast = season.past[0] ?? null

  return (
    <AppShell viewer={viewer} screen="moreska" season={season.year}>
      {identity ? (
        <div className="app__me">
          {/* PROFILE context (#612): `role`, never `title`. The type makes the
              two mutually exclusive, which is what stops an evening's crown
              from ever reaching a person's own block by accident. */}
          {identity.primaryRole ? (
            <RoleMark army={identity.army} role={identity.primaryRole} />
          ) : (
            <RoleMark army={identity.army} />
          )}
          <div className="app__me-body">
            {/* The name and the other roles share a line: the discs belong to
                the name, not to the season sentence under it. */}
            <div className="app__me-name">
              <h2>{identity.name}</h2>
              {identity.others.length > 0 && (
                <span className="app__me-roles">
                  {/* Every one of them, wrapping rather than truncating: this
                      is the reader's own profile and a "+2" would hide the
                      half they opened it to check. The label is on the disc
                      because the disc is otherwise pure colour. */}
                  {identity.others.map((other) => (
                    <RoleMark
                      key={other.role}
                      army={other.army}
                      role={other.role}
                      small
                      label={other.label}
                    />
                  ))}
                </span>
              )}
            </div>
            <p>{identity.line}</p>
          </div>
        </div>
      ) : (
        // "N nastupa pred tobom" is a sentence about the reader's OWN season,
        // and this branch is the reader who has none: a voditelj who does not
        // dance reads the schedule, they are not down for any of it.
        <p className="app__me-none">{S.noMember}</p>
      )}

      {hero && next ? (
        <Hero
          eyebrow={<HeroEyebrow text={hero.eyebrow} today={hero.todayLabel} />}
          className={hero.todayLabel ? 'app__hero--today' : undefined}
          {...(hero.halves
            ? // A split day says the date once, in the eyebrow: the big serif
              // date and the weekday line belong to the single hero (#592).
              {}
            : {
                day: hero.day,
                month: hero.month,
                meta: <HeroMeta lead={hero.metaLead} kind={hero.kind} tone={hero.tone} />,
              })}
        >
          {hero.note && <Note>{hero.note}</Note>}

          {hero.halves ? (
            <HeroHalves halves={hero.halves} moreLabel={hero.moreLabel} memberId={me?.id ?? null} />
          ) : (
            <>
              {me && (
                <Answer
                  performanceId={next.id}
                  memberId={me.id}
                  current={next.myAnswer}
                  disabled={!next.canAnswer}
                  lockNote={next.canAnswer ? null : APP_STRINGS.answer.locked}
                />
              )}

              {hero.armies && (
                <StateBar
                  crni={hero.armies.crni}
                  bili={hero.armies.bili}
                  threshold={hero.armies.threshold}
                  href={hero.href}
                />
              )}
            </>
          )}
        </Hero>
      ) : (
        <Card className="app__empty">
          {/* Two different pieces of news, and the title has to say which: a
              season that is over names its last nastup, one that has not
              started has none to name. */}
          <h2>{lastPast ? S.eosTitle : S.eosNothingTitle}</h2>
          <p>{lastPast ? S.eosBody(formatPerformanceDate(lastPast.date)) : S.eosNothing}</p>
          {/* The same shape as `Button variant="link"`, as a real anchor: the
              way out of an empty season is a navigation, not a decision. */}
          <Link className="ui-btn ui-btn--link" href="/app/leaderboard">
            {APP_STRINGS.home.eosLink}
          </Link>
        </Card>
      )}

      {months.map((month) => (
        <section className="app__month-group" key={month.key}>
          <Section className="app__month-head" title={month.label} aside={month.aside} />
          <List>
            {month.rows.map((row) => (
              <ListRow
                key={row.id}
                href={row.href}
                className={row.cancelled ? 'app__row--cancelled' : undefined}
                lead={<DateDisc day={row.day} weekday={row.weekday} tone={row.tone} />}
                title={<RowTitle row={row} />}
                meta={row.meta}
                trail={row.chip && <Chip tone={row.chip.tone}>{row.chip.label}</Chip>}
              />
            ))}
          </List>
        </section>
      ))}

      {/* The season behind you. A disclosure rather than a section, because
          this screen looks forward and the past is something a dancer goes
          looking for; their own tally of it lives on Ljestvica.

          Inside it, the same month groups the upcoming half has (#612). A flat
          list of twenty-two evenings was readable in July and stopped being so
          in September: a dancer looking back for "that Thursday in kolovoz"
          was counting rows. Descending, because the past is read backwards —
          which costs nothing, since `season.past` already arrives newest
          first and `groupByMonth` keeps the order it is given. */}
      {season.past.length > 0 && (
        <details className="app__past">
          <summary>{S.past(season.past.length)}</summary>
          {pastMonths.map((month) => (
            <section className="app__month-group" key={month.key}>
              <Section className="app__month-head" title={month.label} aside={month.aside} />
              <List>
                {month.rows.map((row) => (
                  <ListRow
                    key={row.id}
                    href={row.href}
                    className={row.cancelled ? 'app__row--cancelled' : undefined}
                    lead={<DateDisc day={row.day} weekday={row.weekday} tone={row.tone} />}
                    title={row.title}
                    meta={row.meta}
                    // POPIS, not "Postava potvrđena" (#612). The old gold chip
                    // named a step in the voditelj's workflow on a screen a
                    // dancer reads backwards; what the dancer wants to know is
                    // that there IS a list, and that the row opens it. Green
                    // and outlined so it is an aside about a finished evening
                    // rather than a state anybody can still change.
                    trail={
                      row.lineupConfirmed ? <Chip tone="green">{S.lineupList}</Chip> : null
                    }
                  />
                ))}
              </List>
            </section>
          ))}
        </details>
      )}
    </AppShell>
  )
}

/**
 * A row's first line: the evening's category, and how close it is (#612).
 *
 * The countdown is a chip rather than a third item in the grey meta line under
 * it, because "za 2 dana" is not of the same kind as "21:00 · Ljetno kino":
 * those are facts about the evening, this is a fact about now. Outlined and
 * lowercase so it reads as an aside — a filled pill here would compete with
 * the reader's own answer chip at the other end of the row.
 *
 * The UPCOMING list only: `nastupRow` returns null for `soon` whenever it was
 * given no day to count from, and the past list gives it none.
 */
function RowTitle({ row }: { row: NastupRow }) {
  if (!row.soon) return <>{row.title}</>
  return (
    <span className="app__row-title">
      {row.title}
      <Chip tone="outline">{row.soon}</Chip>
    </span>
  )
}
