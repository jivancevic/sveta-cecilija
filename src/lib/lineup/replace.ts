// The two lineup writers, as pure DI'd handlers (#432).
//
// `POST /api/app/lineup` REPLACES the whole lineup for one performance, and
// `POST /api/app/lineup/confirm` toggles the flag. Replace rather than patch,
// deliberately: the editor holds the whole list in front of the voditelj, so
// "these are the people who danced" is the sentence they mean when they press
// Spremi, and a per-row API would need a delete verb the phone has no room for.
//
// The transaction is the ROUTE's job (`deps.replaceEntries` runs it): a replace
// that deleted the old rows and then failed to insert the new ones would leave
// a confirmed evening blank, and it is a database fact rather than a rule.
//
// A CONFIRMED lineup refuses the replace with 409 (story 31): "Potvrdi" is
// exactly the promise that the list cannot change by accident, and answering
// 403 would read as "you are not allowed", which the voditelj is — after they
// press Otključaj.
//
// The `/app` cross-site guard runs first on both, like every other
// cookie-authenticated `/app` POST. `requirePermission(req, 'moreska')` is the
// route's own line: a dancer never writes a lineup.

import { rejectAppRequest, type AppRequestMeta } from '@/lib/app/request-guard'
import type { AttendanceMember } from '@/lib/attendance/rules'
import { APP_STRINGS } from '@/lib/app/strings'
import {
  roleWarnings,
  validateLineupEntries,
  type LineupEntry,
  type RoleWarning,
} from './rules'

export interface LineupBody {
  performanceId?: unknown
  entries?: unknown
}

export interface ConfirmBody {
  performanceId?: unknown
  confirmed?: unknown
}

/** What the handler needs to know about the evening it is writing. */
export interface LineupPerformance {
  id: string
  confirmed: boolean
}

export interface LineupReplaceDeps {
  request: AppRequestMeta
  loadPerformance: (id: string) => Promise<LineupPerformance | null>
  /** The ACTIVE moreškanti: the set an entry's member must belong to. */
  loadRoster: () => Promise<AttendanceMember[]>
  /**
   * Delete every row of this performance and insert these, in ONE transaction.
   * Returns nothing: the handler answers with what it validated, not with a
   * re-read.
   */
  replaceEntries: (performanceId: string, entries: readonly LineupEntry[]) => Promise<unknown>
}

export interface LineupConfirmDeps {
  request: AppRequestMeta
  loadPerformance: (id: string) => Promise<LineupPerformance | null>
  /** Sets `lineupConfirmed` and, when confirming, `lineupConfirmedAt`. */
  setConfirmed: (performanceId: string, confirmed: boolean, at: string | null) => Promise<unknown>
  now?: () => Date
}

export interface LineupResult {
  status: number
  body:
    | { ok: true; entries: LineupEntry[]; warnings: RoleWarning[] }
    | { ok: true; confirmed: boolean; confirmedAt: string | null }
    | { error: string }
}

function id(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

/**
 * POST /api/app/lineup.
 *
 * 403/415 cross-site or not JSON; 400 for a body naming no performance, an
 * unknown performance, or entries the rules call nonsense; 409 when the lineup
 * is confirmed; 200 with the entries as stored and the role warnings, so the
 * editor settles on the server's word rather than on its own.
 */
export async function handleLineupReplace(
  body: LineupBody | null | undefined,
  deps: LineupReplaceDeps,
): Promise<LineupResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.lineup.rejected } }

  const performanceId = id(body?.performanceId)
  if (!performanceId) return { status: 400, body: { error: APP_STRINGS.lineup.missing } }

  const performance = await deps.loadPerformance(performanceId)
  if (!performance) return { status: 400, body: { error: APP_STRINGS.lineup.missing } }
  if (performance.confirmed) return { status: 409, body: { error: APP_STRINGS.lineup.locked } }

  const roster = await deps.loadRoster()
  const validated = validateLineupEntries(body?.entries, roster)
  if (!validated.ok) return { status: 400, body: { error: validated.error } }

  await deps.replaceEntries(performanceId, validated.entries)

  return {
    status: 200,
    body: {
      ok: true,
      entries: validated.entries,
      warnings: roleWarnings(validated.entries, roster),
    },
  }
}

/**
 * POST /api/app/lineup/confirm.
 *
 * `confirmed` must be a real boolean: an absent or string value is a caller bug
 * and a 400, never a silent "false" that would unlock an evening nobody asked
 * to unlock. The timestamp is set when confirming and cleared when unlocking,
 * so "confirmed at" never outlives the confirmation it records.
 */
export async function handleLineupConfirm(
  body: ConfirmBody | null | undefined,
  deps: LineupConfirmDeps,
): Promise<LineupResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.lineup.rejected } }

  const performanceId = id(body?.performanceId)
  if (!performanceId) return { status: 400, body: { error: APP_STRINGS.lineup.missing } }
  if (typeof body?.confirmed !== 'boolean') {
    return { status: 400, body: { error: APP_STRINGS.lineup.badConfirm } }
  }

  const performance = await deps.loadPerformance(performanceId)
  if (!performance) return { status: 400, body: { error: APP_STRINGS.lineup.missing } }

  const confirmedAt = body.confirmed ? (deps.now?.() ?? new Date()).toISOString() : null
  await deps.setConfirmed(performanceId, body.confirmed, confirmedAt)

  return { status: 200, body: { ok: true, confirmed: body.confirmed, confirmedAt } }
}
