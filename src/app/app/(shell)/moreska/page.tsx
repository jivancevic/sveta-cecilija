import Link from 'next/link'
import { getSeasonPerformances } from '@/lib/app/roster-data'
import { groupByMonth, pickHeroPerformances } from '@/lib/app/roster-loaders'
import {
  aheadLabel,
  armyLabel,
  heroView,
  identityOf,
  monthSections,
  nastupRow,
} from '@/lib/app/moreska-screen'
import { APP_STRINGS, formatPerformanceDate } from '@/lib/app/strings'
import { Card, Chip, DateDisc, Hero, List, ListRow, Note, RoleMark, Section } from '../../ui'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { Answer } from './Answer'
import { StateBar } from './StateBar'
import { HeroHalves } from '../../HeroHalves'

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

  const pick = pickHeroPerformances(season.upcoming)
  const next = pick?.first ?? null
  const ahead = aheadLabel(season.upcoming)
  // The crown on the reader's own mark is the NEXT nastup's title, from its
  // confirmed postava and from nowhere else (#566, glossary: *Title*).
  const identity = identityOf(me, ahead, next?.myTitle ?? null)
  const months = monthSections(groupByMonth(season.upcoming), { showAnswer: me != null })
  const hero = pick ? heroView(pick) : null
  const lastPast = season.past[0] ?? null

  return (
    <AppShell viewer={viewer} screen="moreska" season={season.year}>
      {identity ? (
        <div className="app__me">
          <RoleMark army={identity.army} title={identity.title} />
          <div className="app__me-body">
            <h2>{identity.name}</h2>
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
        <Hero eyebrow={hero.eyebrow} day={hero.day} month={hero.month} meta={hero.meta}>
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
                  currentArmy={armyLabel(next.myArmy)}
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
          <Section title={month.label} aside={month.aside} />
          <List>
            {month.rows.map((row) => (
              <ListRow
                key={row.id}
                href={row.href}
                className={row.cancelled ? 'app__row--cancelled' : undefined}
                lead={<DateDisc day={row.day} weekday={row.weekday} tone={row.tone} />}
                title={row.title}
                meta={row.meta}
                trail={row.chip && <Chip tone={row.chip.tone}>{row.chip.label}</Chip>}
              />
            ))}
          </List>
        </section>
      ))}

      {/* The season behind you. A disclosure rather than a section, because
          this screen looks forward and the past is something a dancer goes
          looking for; their own tally of it lives on Ljestvica. */}
      {season.past.length > 0 && (
        <details className="app__past">
          <summary>{S.past(season.past.length)}</summary>
          <List>
            {season.past.map((p) => {
              // The past row carries the postava chip instead of an answer
              // chip: what a dancer looks back for is whether they were in it.
              const row = nastupRow(p, { showAnswer: false })
              return (
                <ListRow
                  key={row.id}
                  href={row.href}
                  className={row.cancelled ? 'app__row--cancelled' : undefined}
                  lead={<DateDisc day={row.day} weekday={row.weekday} tone={row.tone} />}
                  title={row.title}
                  meta={row.meta}
                  trail={
                    p.lineupConfirmed ? (
                      <Chip tone="gold">{APP_STRINGS.home.lineupConfirmed}</Chip>
                    ) : null
                  }
                />
              )
            })}
          </List>
        </details>
      )}
    </AppShell>
  )
}
