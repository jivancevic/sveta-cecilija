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

/**
 * The six performance kinds (ADR-0024). `experience` is the Moreška Experience,
 * the short form sold on the public site and danced by three pairs in the
 * society's own premises (CONTEXT.md); `crveni-kriz` is deliberately absent.
 */
export const PERFORMANCE_KINDS = ['redovna', 'dmc', 'gulliver', 'koncert', 'experience', 'ostalo'] as const

export type PerformanceKind = (typeof PERFORMANCE_KINDS)[number]

/**
 * How many dancers a NEW evening of this kind is expected to need (#620).
 *
 * The voditelj sets the real pragovi for an evening in the Pozovi sheet; this
 * is only what a row is created with, and until now it was one number for every
 * kind. A Moreška Experience is danced by **three pairs** in the society's own
 * premises (CONTEXT.md), so eight was wrong on every Experience ever created and
 * the bar said "fale još 5 crnih" about a morning that was full.
 *
 * A per-kind table rather than a special case, so the seventh kind is a line
 * here rather than an `if` somewhere else. Both writers of a new non-public row
 * read it through `newPerformanceRow`: the voditelj's form and the MCP
 * `create_performances` tool.
 */
export const DEFAULT_THRESHOLD: Record<PerformanceKind, { crni: number; bili: number }> = {
  redovna: { crni: 8, bili: 8 },
  dmc: { crni: 8, bili: 8 },
  gulliver: { crni: 8, bili: 8 },
  koncert: { crni: 8, bili: 8 },
  experience: { crni: 3, bili: 3 },
  ostalo: { crni: 8, bili: 8 },
}

/**
 * The kinds Cecilija does not show AT ALL (#635).
 *
 * A *koncert* is the society singing and playing. It is not a sword dance, and
 * counting one as a moreška inflates a dancer's season and, worse, extends or
 * breaks their *niz* on an evening they never danced: today a dancer who skips
 * a concert loses a run of twenty moreške.
 *
 * Hidden rather than dropped. The value stays in the `shows` enum and in the
 * Backoffice, because the wind orchestra and the klapa will get a screen of
 * their own and the kind comes back with them — a migration removing it would
 * only have to be undone. Until then no Cecilija surface offers it, counts it
 * or opens it.
 */
export const HIDDEN_KINDS = ['koncert'] as const satisfies readonly PerformanceKind[]

/** A kind Cecilija hides (#635). */
export type HiddenKind = (typeof HIDDEN_KINDS)[number]

/** A kind Cecilija shows: everything else. */
export type ShownKind = Exclude<PerformanceKind, HiddenKind>

const HIDDEN = new Set<string>(HIDDEN_KINDS)

/**
 * The kinds every Cecilija screen, picker and count works from.
 *
 * Derived rather than typed out, so hiding a seventh kind is one line in
 * {@link HIDDEN_KINDS} and never a list that drifts out of step with it.
 */
export const SHOWN_KINDS = PERFORMANCE_KINDS.filter(
  (k): k is ShownKind => !HIDDEN.has(k),
)

/**
 * The kinds that ARE a moreška: everything Cecilija shows but the Experience.
 *
 * One definition, read by the Ljestvica list (`kindsOf`), the split of the
 * profile's rings and the *niz* chain (#635). A koncert left all three on the
 * same day because it left this list, rather than through three predicates
 * that would have had to be found one at a time.
 */
export const MORESKA_KINDS = SHOWN_KINDS.filter((k) => k !== 'experience')

const MORESKA = new Set<string>(MORESKA_KINDS)

/** True when an evening of this kind counts as a moreška (#635). */
export function isMoreskaKind(kind: unknown): boolean {
  return typeof kind === 'string' && MORESKA.has(kind)
}

/** True when Cecilija shows an evening of this kind at all (#635). */
export function isShownKind(kind: unknown): kind is ShownKind {
  return isPerformanceKind(kind) && !HIDDEN.has(kind)
}

/**
 * The same rule, Payload `Where` form, for a query on `shows`.
 *
 * Usually inside an `and: [...]` beside the caller's own bounds. A row whose
 * `kind` were NULL would be dropped by `not_in`, which is unreachable rather
 * than intended: the column is `required` with a default
 * (`src/collections/Shows.ts`).
 */
export const SHOWN_PERFORMANCE_WHERE = { kind: { not_in: [...HIDDEN_KINDS] } } as const

/**
 * The same rule, raw-SQL form, for a `pool.query` caller (the push cron).
 *
 * The list is interpolated rather than parameterised, and safely: these are
 * this module's own literals, never anything a request carried.
 *
 * @param alias optional table alias or name to qualify the column with.
 */
export function shownPerformanceSql(alias?: string): string {
  const column = `${alias ? `${alias}.` : ''}kind`
  return `${column} NOT IN (${HIDDEN_KINDS.map((k) => `'${k}'`).join(', ')})`
}

const KNOWN_KINDS = new Set<string>(PERFORMANCE_KINDS)

/**
 * Narrows an arbitrary value to a known kind.
 *
 * Wanted the moment a kind is read RAW rather than through Payload (#620: the
 * lineup row lock reads `shows.kind` in SQL, because what a confirmed postava
 * must carry depends on it). A caller that cannot narrow has to invent a
 * fallback, which is a decision and belongs at the call site, not here.
 */
export function isPerformanceKind(value: unknown): value is PerformanceKind {
  return typeof value === 'string' && KNOWN_KINDS.has(value)
}

/**
 * A raw `shows.kind` narrowed, falling back to `ostalo`.
 *
 * `ostalo` rather than a throw, and it is the STRICTEST fallback rather than a
 * neutral one: the confirmation rule splits on this value (#620), and a row
 * whose kind nobody can parse must land on the side that asks for all four
 * titles rather than on the one that would confirm without them. Every caller
 * that reads the column outside Payload uses this, so the fallback is decided
 * once.
 */
export function performanceKindOf(value: unknown): PerformanceKind {
  return isPerformanceKind(value) ? value : 'ostalo'
}

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
