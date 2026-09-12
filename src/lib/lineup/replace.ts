// The two lineup writers, as pure DI'd handlers (#432).
//
// `POST /api/app/lineup` REPLACES the whole lineup for one performance, and
// `POST /api/app/lineup/confirm` toggles the flag. Replace rather than patch,
// deliberately: the editor holds the whole list in front of the voditelj, so
// "these are the people who danced" is the sentence they mean when they press
// Spremi, and a per-row API would need a delete verb the phone has no room for.
//
// The transaction and the row lock live in `./write-tx.ts`, which `deps` wires
// to Payload: a replace that deleted the old rows and then failed to insert the
// new ones would leave a confirmed evening blank, and which writes are atomic
// is a database fact rather than a rule.
//
// A CONFIRMED lineup refuses the replace with 409 (story 31): "Potvrdi" is
// exactly the promise that the list cannot change by accident, and answering
// 403 would read as "you are not allowed", which the voditelj is — after they
// press Otključaj.
//
// THE 409 IS DECIDED TWICE, and only the second one counts (#442 review). The
// pre-check below reads the flag outside the transaction, which saves a
// transaction in the ordinary case and proves nothing about the moment of the
// write; the locked re-check inside `replaceEntries` is what actually refuses a
// Potvrdi that landed while the voditelj was still typing. The handler maps
// both to the same status and the same sentence, so a race and a plain refusal
// read identically to the person holding the phone.
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
import type { LineupConfirmOutcome, LineupWriteOutcome } from './write-tx'

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
   * Delete every row of this performance and insert these, in ONE transaction
   * that first takes the shows row lock and re-reads the confirmation flag.
   * `replaceLineupInTransaction` is the implementation; the outcome it returns
   * is the word the handler answers with, because only that read happened at
   * the moment of the write.
   */
  replaceEntries: (
    performanceId: string,
    entries: readonly LineupEntry[],
  ) => Promise<LineupWriteOutcome>
}

export interface LineupConfirmDeps {
  request: AppRequestMeta
  /**
   * Takes the same shows row lock the replace takes, reads the confirmation and
   * the row count, applies `decideConfirmation` and writes — all inside one
   * transaction (`setLineupConfirmationInTransaction`). The refusals it can
   * return are "that izvedba does not exist" and "an empty postava confirms
   * nothing".
   */
  setConfirmed: (performanceId: string, confirmed: boolean) => Promise<LineupConfirmOutcome>
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

  const outcome = await deps.replaceEntries(performanceId, validated.entries)
  if (!outcome.written) {
    // The locked re-check disagreed with the pre-check: a Potvrdi (or a delete)
    // landed in between. Same status, same sentence as the pre-check.
    return outcome.reason === 'confirmed'
      ? { status: 409, body: { error: APP_STRINGS.lineup.locked } }
      : { status: 400, body: { error: APP_STRINGS.lineup.missing } }
  }

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
 * to unlock. Everything else — the timestamp, the empty-postava refusal, the
 * idempotent re-confirm — is decided under the row lock in `write-tx.ts`,
 * because each of them is a decision about the state at the moment of the
 * write.
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

  const outcome = await deps.setConfirmed(performanceId, body.confirmed)
  if (!outcome.ok) {
    return {
      status: 400,
      body: {
        error:
          outcome.reason === 'empty'
            ? APP_STRINGS.lineup.confirmEmpty
            : APP_STRINGS.lineup.missing,
      },
    }
  }

  return {
    status: 200,
    body: { ok: true, confirmed: outcome.confirmed, confirmedAt: outcome.confirmedAt },
  }
}
