// The offline sales ledger, pure half (ADR-0025). An *offline sale* is a sale
// that produced no `Order` and no `Ticket` row and is therefore recorded as a
// counted LINE: at the door, or on the legacy WordPress site before the
// 2026-06-07 cutover.
//
// Everything here is a pure function over plain values, so the rules unit-test
// without a database. The impure half (insert + the cached counters on `shows`)
// lives in ./data.ts.
//
// The one rule worth stating up front: a discounted seat keeps its real TYPE.
// 32 pensioners who paid €15 are `adult` lines carrying a `discountLabel`, not
// a third price category. Type answers "who sat there", the discount answers
// "why it cost less", and they are separate axes — the same separation a promo
// code already has from the channel on an online order.

import { ADULT_PRICE_EUR, CHILD_PRICE_EUR } from '../pricing'

const CENTS_PER_EUR = 100

/** Which artifact-less channel a line came from. */
export type OfflineSource = 'door' | 'legacy'

/** The same two types the ticketed channels use — deliberately not a parallel vocabulary. */
export type OfflineTicketType = 'adult' | 'child'

export const OFFLINE_SOURCES: readonly OfflineSource[] = ['door', 'legacy']
export const OFFLINE_TICKET_TYPES: readonly OfflineTicketType[] = ['adult', 'child']

/** Postgres `varchar(120)`; keep the app's limit and the column's equal. */
export const MAX_DISCOUNT_LABEL_LENGTH = 120

/** Face value of one seat, in cents. The constants stay the source of truth for
 *  what to CHARGE; a stored line records what WAS charged. */
export function faceValueCents(type: OfflineTicketType): number {
  return (type === 'adult' ? ADULT_PRICE_EUR : CHILD_PRICE_EUR) * CENTS_PER_EUR
}

export type OfflineSaleErrorCode =
  | 'EMPTY'
  | 'BAD_TYPE'
  | 'BAD_QUANTITY'
  | 'BAD_PRICE'
  | 'PRICE_ABOVE_FACE'
  | 'DISCOUNT_REASON_REQUIRED'
  | 'LABEL_TOO_LONG'
  | 'OVER_CORRECTION'

export class OfflineSaleValidationError extends Error {
  constructor(
    readonly code: OfflineSaleErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'OfflineSaleValidationError'
  }
}

/** One line as the caller supplies it. `unitPriceCents` may be omitted to mean face value. */
export interface OfflineSaleLineDraft {
  ticketType: OfflineTicketType
  /** Non-zero integer. NEGATIVE is how a miscount is corrected — see ADR-0025. */
  quantity: number
  unitPriceCents?: number | null
  discountLabel?: string | null
}

/** A validated line: price resolved, label trimmed to null-or-meaningful. */
export interface OfflineSaleLine {
  ticketType: OfflineTicketType
  quantity: number
  unitPriceCents: number
  discountLabel: string | null
}

/**
 * Validate and resolve a batch of drafts into storable lines.
 *
 * Rules, in the order a caller hits them:
 *  - at least one line;
 *  - `ticketType` is one of the two real types;
 *  - `quantity` is a non-zero integer (negative = correction);
 *  - `unitPriceCents` is a non-negative integer, defaulting to face value;
 *  - a price ABOVE face value is refused outright — there are no surcharges,
 *    so it is always a typo;
 *  - a price BELOW face value REQUIRES a `discountLabel`. This is the invariant
 *    that keeps the books explicable: money missing from a line always carries
 *    its own reason, and no one has to reverse-engineer a €15 seat a year later.
 */
export function resolveOfflineSaleLines(drafts: readonly OfflineSaleLineDraft[]): OfflineSaleLine[] {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    throw new OfflineSaleValidationError('EMPTY', 'At least one line is required')
  }

  return drafts.map((draft) => {
    const { ticketType } = draft
    if (!OFFLINE_TICKET_TYPES.includes(ticketType)) {
      throw new OfflineSaleValidationError('BAD_TYPE', `Unknown ticket type: ${String(ticketType)}`)
    }

    const quantity = draft.quantity
    if (!Number.isInteger(quantity) || quantity === 0) {
      throw new OfflineSaleValidationError(
        'BAD_QUANTITY',
        'Quantity must be a non-zero integer (negative corrects an earlier line)',
      )
    }

    const face = faceValueCents(ticketType)
    const rawPrice = draft.unitPriceCents
    const unitPriceCents = rawPrice === undefined || rawPrice === null ? face : rawPrice
    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
      throw new OfflineSaleValidationError('BAD_PRICE', 'Unit price must be a non-negative integer number of cents')
    }
    if (unitPriceCents > face) {
      throw new OfflineSaleValidationError(
        'PRICE_ABOVE_FACE',
        `Unit price ${unitPriceCents} exceeds the ${ticketType} face value of ${face}`,
      )
    }

    const label = typeof draft.discountLabel === 'string' ? draft.discountLabel.trim() : ''
    if (label.length > MAX_DISCOUNT_LABEL_LENGTH) {
      throw new OfflineSaleValidationError(
        'LABEL_TOO_LONG',
        `Discount label is longer than ${MAX_DISCOUNT_LABEL_LENGTH} characters`,
      )
    }
    if (unitPriceCents < face && label.length === 0) {
      throw new OfflineSaleValidationError(
        'DISCOUNT_REASON_REQUIRED',
        'A line priced below face value must carry a discount label saying why',
      )
    }

    return { ticketType, quantity, unitPriceCents, discountLabel: label.length > 0 ? label : null }
  })
}

/** What a set of lines adds up to. Every field is signed, so corrections subtract. */
export interface OfflineTotals {
  seats: number
  adult: number
  child: number
  revenueCents: number
  /** Seats sold below face value — the discounted subset of `seats`. */
  discountedSeats: number
}

export const EMPTY_OFFLINE_TOTALS: OfflineTotals = {
  seats: 0,
  adult: 0,
  child: 0,
  revenueCents: 0,
  discountedSeats: 0,
}

export function sumOfflineLines(lines: readonly OfflineSaleLine[]): OfflineTotals {
  const totals: OfflineTotals = { ...EMPTY_OFFLINE_TOTALS }
  for (const line of lines) {
    totals.seats += line.quantity
    if (line.ticketType === 'adult') totals.adult += line.quantity
    else totals.child += line.quantity
    totals.revenueCents += line.quantity * line.unitPriceCents
    if (line.unitPriceCents < faceValueCents(line.ticketType)) {
      totals.discountedSeats += line.quantity
    }
  }
  return totals
}

export function addOfflineTotals(a: OfflineTotals, b: OfflineTotals): OfflineTotals {
  return {
    seats: a.seats + b.seats,
    adult: a.adult + b.adult,
    child: a.child + b.child,
    revenueCents: a.revenueCents + b.revenueCents,
    discountedSeats: a.discountedSeats + b.discountedSeats,
  }
}

/**
 * The net seat delta of a batch — what the cached counter on `shows` must move
 * by (`in_person_sold` for door lines, `legacy_reserved` for legacy ones).
 */
export function netQuantity(lines: readonly OfflineSaleLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}
