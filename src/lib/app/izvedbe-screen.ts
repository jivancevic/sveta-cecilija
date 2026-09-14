// What Izvedbe says, as pure functions over what the season already loads
// (#567, decisions Q32, Q53).
//
// Izvedbe is the box office's register of the season: every evening the society
// plays, public or not, with the seats under the public ones. It is the SELLING
// register throughout ("izvedba", CONTEXT.md, *Two registers*) — the dancer's
// words for the same night are on Moreška and on Stanje, and nothing here
// borrows from them. Nothing dancer-facing is on this screen at all since #565:
// no answer, no army, no attendance chip.
//
// Two rules here are worth more than the formatting they look like:
//
//   1. **A row says what it IS, and a public row says what it sold.** A Redovna
//      is named by its kind; a booking is named by its kind AND its client,
//      because "Brod" alone is three different evenings in one season and this
//      is the screen where they have to be told apart (Moreška deliberately
//      refuses to name a client, Q30 — a different screen for a different
//      reader).
//   2. **The sales line is absent rather than empty.** Seats reach this module
//      only for a `tickets` holder and only on a public row, so a booking and a
//      voditelj-only reader get a row with no numbers on it rather than a row
//      of zeroes. The gate is the page's (`loadSeasonSales` is not even called
//      without `tickets`); what is here is that a missing `sales` prints
//      nothing.
//
// The numbers themselves are never re-derived: `sales-view.ts` owns what an
// evening sold, `VENUE_CAPACITY` owns the house, and this module only words
// them. No IO, no clock, no Payload — `izvedbe-screen.test.ts` is where the
// rules are asserted, not a rendered page.

import {
  channelSplit,
  salesBadges,
  seatsRemaining,
  seatsSold,
  type PerformanceSales,
} from './sales-view'
import { pluralize, type MonthGroup, type RosterPerformance } from './roster-loaders'
import { performancePlace } from './performance-place'
import {
  APP_STRINGS,
  KIND_LABELS,
  dayOfMonth,
  formatPerformanceDateLong,
  monthGenitiveOf,
  shortWeekday,
  weekdayLabel,
} from './strings'
import { VENUE_CAPACITY } from '@/lib/venues'

/** The design system's chip tone, restated: `src/lib` never imports `src/app`. */
type ChipTone = 'plain' | 'gold' | 'warn'

const S = APP_STRINGS.izvedbe
const SALES = APP_STRINGS.sales

/**
 * The name of one evening in the selling register.
 *
 * A public row is its kind ("Redovna"). A booking is its kind and, when there
 * is one, the client that booked it: on this screen an evening is a job with a
 * customer, and the secretary looking for the Ponant call finds it by name.
 */
export function izvedbaTitle(performance: Pick<RosterPerformance, 'kind' | 'isPublic' | 'client'>): string {
  const kind = KIND_LABELS[performance.kind]
  if (performance.isPublic) return kind
  return performance.client ? `${kind}, ${performance.client}` : kind
}

/** One row's sales line, or null when the row has no sale to report. */
export interface RowSales {
  /** "prodano 132 od 350". */
  sold: string
  /** "online 80 · partner 12 · vrata 30", or the "nothing yet" sentence. */
  split: string
}

export function rowSales(sales: PerformanceSales | null | undefined): RowSales | null {
  if (!sales) return null
  const split = channelSplit(sales)
  return {
    sold: S.sold(seatsSold(sales), VENUE_CAPACITY[sales.venue]),
    split: split.length === 0 ? SALES.none : split.map((c) => `${c.label} ${c.value}`).join(' · '),
  }
}

/**
 * The one chip a row may carry, worst news first.
 *
 * A row has room for exactly one (T1: "a row that wants a fourth thing is a
 * screen"), so the order of `salesBadges` decides which fact wins: cancelled
 * over paused over the two audit badges. A cancelled BOOKING has no sales row
 * to read it off, so the flag on the performance answers for it.
 */
export function rowChip(
  performance: Pick<RosterPerformance, 'cancelled'>,
  sales: PerformanceSales | null | undefined,
): { label: string; tone: ChipTone } | null {
  const badge = sales ? salesBadges(sales)[0] : null
  if (badge) {
    return {
      label: badge.label,
      tone: badge.key === 'cancelled' || badge.key === 'paused' ? 'warn' : 'plain',
    }
  }
  return performance.cancelled ? { label: SALES.badges.cancelled, tone: 'warn' } : null
}

/** One row of the season list. */
export interface IzvedbaRow {
  id: string
  href: string
  /** "14" */
  day: string
  /** "pon" */
  weekday: string
  /** Gold disc: a Redovna, the only kind that sells to the public. */
  gold: boolean
  /** "Redovna", or "Brod, Le Ponant". */
  title: string
  /** "21:00 · Ljetno kino". */
  meta: string
  cancelled: boolean
  sales: RowSales | null
  chip: { label: string; tone: ChipTone } | null
}

export function izvedbaRow(
  performance: RosterPerformance,
  sales: PerformanceSales | null | undefined,
): IzvedbaRow {
  const place = performancePlace(performance)
  return {
    id: performance.id,
    href: `/app/performances/${performance.id}`,
    day: dayOfMonth(performance.date),
    weekday: shortWeekday(performance.date),
    gold: performance.kind === 'redovna',
    title: izvedbaTitle(performance),
    meta: [performance.time, place].filter(Boolean).join(' · '),
    cancelled: performance.cancelled,
    sales: rowSales(sales),
    chip: rowChip(performance, sales),
  }
}

/** One month of the list: the heading, its count, and the rows under it. */
export interface IzvedbeMonth {
  key: string
  /** "Rujan" */
  label: string
  /** "5 izvedbi" — of evenings that are still going to happen. */
  aside: string
  rows: IzvedbaRow[]
}

export function izvedbeMonths(
  groups: readonly MonthGroup[],
  sales: ReadonlyMap<string, PerformanceSales> | null,
): IzvedbeMonth[] {
  return groups.map((group) => ({
    key: `${group.year}-${group.month}`,
    // A cancelled evening stays in the list but is not one of "5 izvedbi" in
    // September: it is not going to happen.
    aside: pluralize(group.performances.filter((p) => !p.cancelled).length, S.count),
    label: group.label,
    rows: group.performances.map((p) => izvedbaRow(p, sales?.get(p.id))),
  }))
}

/** The one card the list is opened for: the next evening on the schedule. */
export interface IzvedbeHero {
  id: string
  /** "Sljedeća izvedba · Ljetno kino" */
  eyebrow: string
  /** "14" */
  day: string
  /** "rujna" */
  month: string
  /** "Ponedjeljak · 21:00 · Redovna" */
  meta: string
  href: string
  /**
   * The seats, when the reader is the blagajna and the evening sells any: the
   * ring's two numbers and the line under it. Absent rather than zeroed for a
   * voditelj, who has no seat count on this hero and never had one.
   */
  seats: { sold: number; capacity: number; caption: string } | null
}

export function izvedbeHero(
  performance: RosterPerformance,
  sales: PerformanceSales | null | undefined,
): IzvedbeHero {
  const place = performancePlace(performance)
  const left = sales ? seatsRemaining(sales) : 0
  return {
    id: performance.id,
    eyebrow: [S.next, place].filter(Boolean).join(' · '),
    day: dayOfMonth(performance.date),
    month: monthGenitiveOf(performance.date),
    meta: [weekdayLabel(performance.date), performance.time, izvedbaTitle(performance)]
      .filter(Boolean)
      .join(' · '),
    href: `/app/performances/${performance.id}`,
    seats: sales
      ? {
          sold: seatsSold(sales),
          capacity: VENUE_CAPACITY[sales.venue],
          // An oversold room says so rather than showing a comfortable zero:
          // it is a miscounted door batch somebody has to notice (ADR-0025).
          caption: left < 0 ? SALES.over(-left) : SALES.remaining(left),
        }
      : null,
  }
}

/**
 * The head of the detail page (#567, Q32).
 *
 * **The title is the DATE**, because that is how a secretary on the phone
 * refers to an evening ("the fifth of August"), and the kind and the house are
 * the line under it. It replaced a title that said "Redovna" on twenty-two
 * rows of a season, which named the category and not the evening.
 */
export interface IzvedbaHead {
  /** "Subota, 19. rujna" — what the header prints as the page's title. */
  title: string
  /** "Redovna · 21:00 · Ljetno kino" */
  meta: string
  chips: { label: string; tone: ChipTone }[]
}

export function izvedbaHead(
  performance: RosterPerformance,
  sales: PerformanceSales | null | undefined,
): IzvedbaHead {
  const place = performancePlace(performance)
  const chips = sales
    ? salesBadges(sales).map((b) => ({
        label: b.label,
        tone: (b.key === 'cancelled' || b.key === 'paused' ? 'warn' : 'plain') as ChipTone,
      }))
    : performance.cancelled
      ? [{ label: SALES.badges.cancelled, tone: 'warn' as ChipTone }]
      : []
  return {
    title: formatPerformanceDateLong(performance.date),
    meta: [izvedbaTitle(performance), performance.time, place].filter(Boolean).join(' · '),
    chips,
  }
}
