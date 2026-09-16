import Link from 'next/link'
import { can } from '@/lib/access/permissions'
import { getSeasonPerformances } from '@/lib/app/roster-data'
import { loadSeasonSales } from '@/lib/app/sales-data'
import { groupByMonth, pickNextPerformance } from '@/lib/app/roster-loaders'
import {
  izvedbaRow,
  izvedbeHero,
  izvedbeMonths,
  type IzvedbaRow,
} from '@/lib/app/izvedbe-screen'
import { mayWritePerformance } from '@/lib/app/performance-actions'
import {
  PAST_PARAM,
  readFlagParam,
  type RawSearchParams,
} from '@/lib/app/screen-state'
import { APP_STRINGS, formatPerformanceDate } from '@/lib/app/strings'
import {
  Card,
  Chip,
  DateDisc,
  Hero,
  List,
  ListRow,
  ParamDetails,
  Ring,
  Section,
} from '../../ui'
import { AppShell } from '../../AppShell'
import { AddPerformance } from '../../PerformanceForm'
import { openScreen } from '../../gate'

// `/app/performances` — Izvedbe, the box office's register of the season (#567).
//
// One row per evening the society plays, public or not, in the order they
// happen: the next one as a hero, then the season a month at a time, then the
// past behind a disclosure. It is the SELLING register throughout ("izvedba",
// CONTEXT.md) and there is nothing dancer-facing left on it — the answer
// buttons, the army chip and the headcounts moved to Moreška and Stanje with
// #565 and #566, and a `moreskant` login does not unlock this screen at all.
//
// **One screen, content by `can()`** (#476). A `tickets` holder reads a sales
// line under every public row (sold of capacity, where the seats came from) and
// the flags beside it; a voditelj reads the same schedule without the numbers.
// Since #567 both of them may add and correct an evening, so *Dodaj izvedbu* is
// offered to either half and the form's two shapes follow the EVENING (a house
// and a capacity, or a place and a client) rather than the reader.
//
// Everything here is server-rendered except the Dodaj form. What the rows SAY
// is `lib/app/izvedbe-screen.ts`, pure and tested without a database; what the
// numbers ARE is `sales-view.ts`, which nothing on this page re-derives.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.izvedbe

/**
 * One evening in the list: the date disc, what it is, and what it sold.
 *
 * The sales line is a second line INSIDE the row's meta rather than a fourth
 * thing on the row (T1: "a row that wants a fourth thing is a screen"), and it
 * is absent altogether on a row with no seats — a booking, or any row for a
 * reader who is not the blagajna.
 */
function IzvedbaListRow({ row }: { row: IzvedbaRow }) {
  return (
    <ListRow
      href={row.href}
      className={row.cancelled ? 'app__row--cancelled' : undefined}
      lead={<DateDisc day={row.day} weekday={row.weekday} gold={row.gold} />}
      title={row.title}
      meta={
        <>
          {row.meta}
          {row.sales && (
            <span className="app__izv-sales">
              <b>{row.sales.sold}</b>
              <span>{row.sales.split}</span>
            </span>
          )}
        </>
      }
      trail={row.chip && <Chip tone={row.chip.tone}>{row.chip.label}</Chip>}
    />
  )
}

export default async function PerformancesPage({
  searchParams,
}: {
  // Only the open state of the past (#666); the season itself is not filtered.
  searchParams: Promise<RawSearchParams>
}) {
  const { viewer, refusal } = await openScreen('performances')
  if (refusal) return refusal

  const past = readFlagParam(await searchParams, PAST_PARAM)

  // `can()` over the set the viewer already carries, never a second read and
  // never a role word.
  const blagajna = can({ permissions: viewer.permissions }, 'tickets')
  const mayWrite = mayWritePerformance(viewer.permissions)

  // One season-wide read of the sales, not one per row: the numbers are five
  // aggregates and the alternative is a round trip per evening on the screen a
  // secretary opens twenty times a week.
  const [season, sales] = await Promise.all([
    getSeasonPerformances({ memberId: viewer.me?.id ?? null, voditelj: viewer.voditelj }),
    blagajna ? loadSeasonSales() : Promise.resolve(null),
  ])

  const next = pickNextPerformance(season.upcoming)
  const hero = next ? izvedbeHero(next, sales?.get(next.id)) : null
  const months = izvedbeMonths(groupByMonth(season.upcoming), sales)
  const lastPast = season.past[0] ?? null

  return (
    <AppShell viewer={viewer} screen="performances" season={season.year}>
      {hero ? (
        <Hero eyebrow={hero.eyebrow} day={hero.day} month={hero.month} meta={hero.meta}>
          {/* The ring is the seats and nothing else: a house filling up is a
              proportion before it is a number (T1). It is absent, rather than
              zeroed, for a reader who is not the blagajna. */}
          {hero.seats && (
            <div className="app__izv-hero-seats">
              <Ring value={hero.seats.sold} max={hero.seats.capacity} />
              <div>
                <b>{`${hero.seats.sold}/${hero.seats.capacity}`}</b>
                <span className="ui-small">{hero.seats.caption}</span>
              </div>
            </div>
          )}
          <Link className="ui-btn ui-btn--link app__izv-hero-link" href={hero.href}>
            {APP_STRINGS.sales.detailLink} ›
          </Link>
        </Hero>
      ) : (
        <Card className="app__empty">
          {/* Two different pieces of news, and the title has to say which: a
              season that is over names its last evening, one that has not
              started has none to name. */}
          <h2>{lastPast ? S.eosTitle : S.eosNothingTitle}</h2>
          <p>{lastPast ? S.eosBody(formatPerformanceDate(lastPast.date)) : S.eosNothing}</p>
        </Card>
      )}

      {/* Closed until it is asked for, and under the hero rather than over it:
          the question this screen answers first is still "what is next". Both
          halves get both shapes since #567; the tick box starts on the one the
          reader enters most, which is the public evening for the blagajna and
          the booking for a voditelj. */}
      {mayWrite && <AddPerformance canPublic canBooking defaultPublic={blagajna} />}

      {months.map((month) => (
        <section className="app__month-group" key={month.key}>
          <Section title={month.label} aside={month.aside} />
          <List>
            {month.rows.map((row) => (
              <IzvedbaListRow key={row.id} row={row} />
            ))}
          </List>
        </section>
      ))}

      {/* The season behind you: a disclosure rather than a section, because a
          schedule is read forwards and last month's evening is something a
          person goes looking for (to correct a door batch, usually). */}
      {season.past.length > 0 && (
        <ParamDetails
          className="app__past"
          param={PAST_PARAM}
          open={past}
          summary={S.past(season.past.length)}
        >
          <List>
            {season.past.map((p) => (
              <IzvedbaListRow key={p.id} row={izvedbaRow(p, sales?.get(p.id))} />
            ))}
          </List>
        </ParamDetails>
      )}
    </AppShell>
  )
}
