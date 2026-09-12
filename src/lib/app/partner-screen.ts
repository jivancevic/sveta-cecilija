// The pure half of Prodaja (#505), the reseller's sell screen.
//
// A port of the Backoffice partner dashboard, so nothing here is new policy:
// it is the arithmetic and the refusals that used to sit inline inside
// `AdminDashboardView`/`PartnerSellForm`, lifted out so they can be tested and
// so the page and the form agree on them.
//
// The server is still the authority on every one of these rules. The sell
// route re-reads the Partner, re-checks `active`, and runs the seat maths
// inside the per-show advisory lock (`/api/partner/sell`). What is here is the
// courtesy half: it stops an obvious oversell before the round trip and tells
// a misconfigured login what is wrong instead of showing an empty screen.

import { ADULT_PRICE_EUR, CHILD_PRICE_EUR } from '@/lib/pricing'
import { VENUE_LABEL, type Venue } from '@/lib/venues'
import { formatPerformanceDateLong } from './strings'

const CENTS_PER_EUR = 100

/** The Partners row a `partner` login is bound to, as the screens read it. */
export interface PartnerRecord {
  id: string
  name: string
  active: boolean
  /** Percent of gross the partner keeps (ADR-0008); 10 unless set otherwise. */
  commissionPercent: number
}

/**
 * What Prodaja and Obračun do about the account in front of them.
 *
 * Ownership is fail-safe: a login with no Partner link, or one pointed at a
 * deactivated Partner, sees a sentence and NEVER any figure. The shell already
 * strips `partner` from the set when the link is missing
 * (`NavContext.hasPartner`), so `unlinked` is the belt to that braces; the
 * deactivated case has no such guard anywhere else, which is why it is
 * spelled out here.
 */
export type PartnerScreenState =
  | { kind: 'ok'; partner: PartnerRecord }
  | { kind: 'unlinked' }
  | { kind: 'inactive'; name: string }

export function partnerScreenState(
  partner: PartnerRecord | null | undefined,
): PartnerScreenState {
  if (!partner) return { kind: 'unlinked' }
  if (!partner.active) return { kind: 'inactive', name: partner.name }
  return { kind: 'ok', partner }
}

/** One upcoming performance as `getUpcomingShows()` hands it over. */
export interface SellShowInput {
  id: string | number
  /** `YYYY-MM-DD`. */
  date: string
  /** `HH:MM`, Europe/Zagreb wall clock. */
  time: string
  venue: string
  /** Capacity minus every seat already taken; may be negative if oversold. */
  remaining: number
}

/** One row of the performance picker. */
export interface SellOption {
  id: string
  /** "Petak, 17. srpnja · 21:30 · Ljetno kino". */
  label: string
  /** Seats left, never negative. */
  remaining: number
  soldOut: boolean
}

export function sellOptions(shows: readonly SellShowInput[]): SellOption[] {
  return shows.map((show) => {
    // An oversold evening (a legacy count corrected upward, say) would make a
    // negative remaining read as "seats" everywhere downstream; clamp once,
    // here, so no stepper and no label has to remember it.
    const remaining = Math.max(0, show.remaining)
    const venue = VENUE_LABEL.hr[show.venue as Venue] ?? show.venue
    return {
      id: String(show.id),
      label: `${formatPerformanceDateLong(show.date)} · ${show.time} · ${venue}`,
      remaining,
      soldOut: remaining <= 0,
    }
  })
}

/**
 * How far one stepper may go: every seat left that the other category has not
 * already claimed. The two steppers share one pool of seats, so the adult
 * stepper's ceiling moves as children are added and back again.
 */
export function stepperMax(remaining: number, other: number): number {
  return Math.max(0, remaining - other)
}

/** What a party costs, in EUR cents. Prices are fixed (CLAUDE.md hard rule). */
export function saleTotalCents(adults: number, children: number): number {
  return (adults * ADULT_PRICE_EUR + children * CHILD_PRICE_EUR) * CENTS_PER_EUR
}
