// Performance kind / public flag: the domain rules that turn the `shows` table
// into the record of EVERY performance (ADR-0024, phase 2).
//
// A **public performance** is what a show has always been: a venue, a capacity,
// online + partner sales, `/tickets`, the door, ticket statistics. A
// **non-public performance** (a cruise-ship call, a concert, a one-off) has a
// free-text `location`, an optional `client`, no venue, no capacity, no sales,
// and must never reach a buyer.
//
// This module is pure — no IO, no Payload, no SQL execution — so both the
// predicate and the save validation can be unit-tested directly. `src/lib/shows.ts`
// and every other buyer-facing consumer import the predicate from here rather
// than spelling `isPublic` themselves.

/** The five performance kinds (ADR-0024). `crveni-kriz` is deliberately absent. */
export const PERFORMANCE_KINDS = ['redovna', 'dmc', 'gulliver', 'koncert', 'ostalo'] as const

export type PerformanceKind = (typeof PERFORMANCE_KINDS)[number]

/**
 * THE public-performance predicate, Payload `Where` form.
 *
 * Every buyer-, partner-, door- or ticket-statistics-facing query on `shows`
 * must include this fragment (usually inside an `and: [...]`). There is exactly
 * one spelling of the rule and it lives here.
 */
export const PUBLIC_PERFORMANCE_WHERE = { isPublic: { equals: true } } as const

/**
 * The same predicate, raw-SQL form, for `pool.query` / drizzle callers.
 *
 * @param alias optional table alias or name to qualify the column with.
 */
export function publicPerformanceSql(alias?: string): string {
  return `${alias ? `${alias}.` : ''}is_public = true`
}

/**
 * True when a row (Payload doc or raw pg row) is a public performance.
 *
 * A row carrying neither key is treated as public: rows that predate the expand
 * migration backfill to `is_public = true` through the column default, and the
 * fixtures of older tests don't carry the field at all.
 */
export function isPublicPerformance(row: Record<string, unknown>): boolean {
  const raw = 'isPublic' in row ? row.isPublic : 'is_public' in row ? row.is_public : true
  return raw !== false
}

/** Thrown by {@link validateAndNormalisePerformance}; the collection hook re-wraps it. */
export class PerformanceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PerformanceValidationError'
  }
}

/** The subset of a Shows document this module reasons about. */
export interface PerformanceShape {
  kind?: unknown
  isPublic?: unknown
  venue?: unknown
  location?: unknown
  client?: unknown
  inPersonSold?: unknown
  legacyReserved?: unknown
  onlineSalesPaused?: unknown
  [key: string]: unknown
}

function isBlank(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}

/**
 * Validate the kind/isPublic invariants and normalise the sales fields.
 *
 * Rules (ADR-0024 → #404 "Implementation Decisions"):
 * - `kind = redovna` requires `isPublic = true`.
 * - `isPublic = true` requires a `venue`.
 * - `isPublic = false` requires a `location`, and forces `venue` to NULL,
 *   `inPersonSold` / `legacyReserved` to 0 and `onlineSalesPaused` to false —
 *   whatever the form sent.
 *
 * Returns a NEW object; the input is never mutated. Throws
 * {@link PerformanceValidationError} with a buyer-free, admin-readable message.
 */
export function validateAndNormalisePerformance<T extends PerformanceShape>(data: T): T {
  const out = { ...data }

  // Rows written before the expand (and older test fixtures) carry neither
  // field; they are public redovna performances by definition.
  const kind = (out.kind ?? 'redovna') as string
  const isPublic = out.isPublic == null ? true : out.isPublic === true

  if (!(PERFORMANCE_KINDS as readonly string[]).includes(kind)) {
    throw new PerformanceValidationError(
      `Unknown performance kind "${kind}". Expected one of: ${PERFORMANCE_KINDS.join(', ')}.`,
    )
  }

  if (kind === 'redovna' && !isPublic) {
    throw new PerformanceValidationError(
      'A redovna performance is always public. Choose another kind, or tick "Public performance".',
    )
  }

  if (isPublic) {
    if (isBlank(out.venue)) {
      throw new PerformanceValidationError('A public performance needs a venue.')
    }
    return out
  }

  if (isBlank(out.location)) {
    throw new PerformanceValidationError(
      'A non-public performance needs a location (for example "Zimsko kino" or "Sv. Justina").',
    )
  }

  // Non-public: no venue, no capacity, no sales.
  out.venue = null
  out.inPersonSold = 0
  out.legacyReserved = 0
  // Only if the collection actually carries the field — don't invent a key.
  if ('onlineSalesPaused' in out) out.onlineSalesPaused = false

  return out
}
