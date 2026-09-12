// The voditelj's half of Izvedbe: Dodaj, Uredi, Otkaži, Pragovi (#503, ADR-0024).
//
// Branimir keeps next month's cruise calls in the Backoffice today, which means
// a raw collection form with a venue field, sales counters and a public flag on
// it. These four handlers are the same four jobs as named actions, and the rule
// that shapes all of them is one sentence from the collections table in
// CLAUDE.md: **`moreska` owns non-public rows, and on a public row it owns the
// roster fields and nothing else.**
//
// So Dodaj can only ever produce a non-public performance (the shared validator
// refuses `redovna` outright), Uredi and Otkaži refuse a public row, and only
// Pragovi reaches one — a threshold is a fact about how many dancers an evening
// needs, which is true of a Redovna as much as of a ship call.
//
// Pure + DI in the `note.ts` / `alarm.ts` shape: the cross-site guard first,
// then the validation, then the work, with the permission gate left to the
// route (`requirePermission(req, 'moreska')`). The writes themselves are the
// seam's (`getRepo().shows`), which puts them on Payload's local API so the
// Shows hooks keep telling the roster what changed.

import {
  newPerformanceRow,
  parseNonPublicPerformance,
  performanceEditPatch,
  PerformanceValidationError,
  type NewPerformanceRow,
} from '@/lib/performance-input'
import type { PerformancePatch, PerformanceRow } from '@/lib/repo/shows'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'
import { APP_STRINGS } from './strings'

/**
 * The highest army threshold anyone can mean.
 *
 * A moreška is danced by two armies of about eight; the roster has never held
 * forty active dancers. The cap is not a domain rule so much as a typo guard:
 * it is what stops a stuck stepper or a pasted number from turning every
 * headcount on the screen red forever.
 */
export const MAX_THRESHOLD = 40

export interface PerformanceFormDeps {
  request: AppRequestMeta
  /** The row the action is about; null when the id is not a performance. */
  loadPerformance: (id: string) => Promise<PerformanceRow | null>
  /** `getRepo().shows.createPerformances` — the ONE shared writer. */
  createPerformances: (rows: readonly NewPerformanceRow[]) => Promise<{ created: string[] }>
  /** `getRepo().shows.updatePerformance` — through the collection, so hooks run. */
  updatePerformance: (id: string, patch: PerformancePatch) => Promise<void>
}

export interface PerformanceFormResult {
  status: number
  body: { ok: true; date?: string } | { error: string }
}

function ok(extra: { date?: string } = {}): PerformanceFormResult {
  return { status: 200, body: { ok: true, ...extra } }
}

function refuse(status: number, error: string): PerformanceFormResult {
  return { status, body: { error } }
}

function idOf(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/** The `/app` cross-site guard, in this screen's own words. */
function guarded(deps: PerformanceFormDeps): PerformanceFormResult | null {
  const rejection = rejectAppRequest(deps.request)
  return rejection ? refuse(rejection.status, APP_STRINGS.performance.rejected) : null
}

/**
 * The row an action is about, or the refusal that replaces it.
 *
 * `requirePublic: false` is the "this is not yours" rule: a public performance
 * is the blagajna's to move and to cancel, because both of those reach ticket
 * holders (#497). The refusal is a 403 rather than a 404 — the voditelj can
 * SEE the evening, they simply may not do this to it, and pretending it is not
 * there would send them looking for a bug.
 */
async function loadOwned(
  rawId: unknown,
  deps: PerformanceFormDeps,
  opts: { nonPublicOnly: boolean },
): Promise<{ row: PerformanceRow } | { refusal: PerformanceFormResult }> {
  const id = idOf(rawId)
  if (!id) return { refusal: refuse(400, APP_STRINGS.performance.missing) }

  const row = await deps.loadPerformance(id)
  if (!row) return { refusal: refuse(400, APP_STRINGS.performance.missing) }
  if (opts.nonPublicOnly && row.isPublic) {
    return { refusal: refuse(403, APP_STRINGS.performance.publicRow) }
  }
  return { row }
}

/** POST /api/app/performances — Dodaj izvedbu. */
export async function handleCreatePerformance(
  body: unknown,
  deps: PerformanceFormDeps,
): Promise<PerformanceFormResult> {
  const rejection = guarded(deps)
  if (rejection) return rejection

  const parsed = parseNonPublicPerformance(body)
  if (!parsed.ok) return refuse(400, parsed.error)

  let row: NewPerformanceRow
  try {
    row = newPerformanceRow(parsed.fields)
  } catch (err) {
    // The collection's own invariants, which the validator above has already
    // satisfied. Reached only if the two ever disagree, and then it is a 400
    // with the reason rather than a 500 out of the middle of a write.
    return refuse(
      400,
      err instanceof PerformanceValidationError ? err.message : APP_STRINGS.performance.failed,
    )
  }

  await deps.createPerformances([row])
  return ok({ date: parsed.fields.dateStr })
}

/** PATCH /api/app/performances/[id] — Uredi. Non-public rows only. */
export async function handleEditPerformance(
  rawId: unknown,
  body: unknown,
  deps: PerformanceFormDeps,
): Promise<PerformanceFormResult> {
  const rejection = guarded(deps)
  if (rejection) return rejection

  const found = await loadOwned(rawId, deps, { nonPublicOnly: true })
  if ('refusal' in found) return found.refusal

  const parsed = parseNonPublicPerformance(body)
  if (!parsed.ok) return refuse(400, parsed.error)

  await deps.updatePerformance(found.row.id, performanceEditPatch(parsed.fields))
  return ok({ date: parsed.fields.dateStr })
}

/**
 * POST /api/app/performances/[id]/cancel — Otkaži. Non-public rows only.
 *
 * A plain status flip and nothing else: a booking sells no tickets, so there is
 * nobody to refund and nobody to mail. The roster learns about it through the
 * Shows `afterChange` hook, exactly as it learns about a moved date, which is
 * why this writes through the collection rather than with raw SQL.
 */
export async function handleCancelPerformance(
  rawId: unknown,
  deps: PerformanceFormDeps,
): Promise<PerformanceFormResult> {
  const rejection = guarded(deps)
  if (rejection) return rejection

  const found = await loadOwned(rawId, deps, { nonPublicOnly: true })
  if ('refusal' in found) return found.refusal

  // Already cancelled is the outcome the presser wanted, so it is a success
  // with no write: a second update would push "otkazano" at the roster twice.
  if (found.row.cancelled) return ok()

  await deps.updatePerformance(found.row.id, { status: 'cancelled' })
  return ok()
}

export type ThresholdResult =
  | { ok: true; crni: number; bili: number }
  | { ok: false; error: string }

function threshold(value: unknown): number | null {
  // An absent or blank value is NOT zero, however happily `Number('')` says it
  // is: a body that forgot half the pair would otherwise silently set a
  // threshold of 0 and turn the red warning off for good.
  if (typeof value !== 'number') {
    const raw = typeof value === 'string' ? value.trim() : ''
    if (raw === '') return null
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_THRESHOLD ? parsed : null
  }
  if (!Number.isInteger(value) || value < 0 || value > MAX_THRESHOLD) return null
  return value
}

/** Both numbers or neither: a half-sent pair would silently keep the old one. */
export function parseThresholds(body: unknown): ThresholdResult {
  const row = (body ?? {}) as { crni?: unknown; bili?: unknown }
  const crni = threshold(row.crni)
  const bili = threshold(row.bili)
  if (crni === null || bili === null) {
    return { ok: false, error: APP_STRINGS.thresholds.outOfRange(MAX_THRESHOLD) }
  }
  return { ok: true, crni, bili }
}

/**
 * POST /api/app/performances/[id]/thresholds — Pragovi.
 *
 * The one voditelj write that reaches a PUBLIC performance, and deliberately:
 * how many crni and bili an evening needs is a fact about the dance, not about
 * the ticket shop, and the collection's own field access says the same thing
 * (`canEditRosterField` asks only for `moreska`, never about the row).
 */
export async function handleThresholds(
  rawId: unknown,
  body: unknown,
  deps: PerformanceFormDeps,
): Promise<PerformanceFormResult> {
  const rejection = guarded(deps)
  if (rejection) return rejection

  const found = await loadOwned(rawId, deps, { nonPublicOnly: false })
  if ('refusal' in found) return found.refusal

  const parsed = parseThresholds(body)
  if (!parsed.ok) return refuse(400, parsed.error)

  await deps.updatePerformance(found.row.id, {
    thresholdCrni: parsed.crni,
    thresholdBili: parsed.bili,
  })
  return ok()
}
