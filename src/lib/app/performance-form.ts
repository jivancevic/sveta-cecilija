// Dodaj, Uredi, Otkaži, Pragovi and Pauziraj on one izvedba (#503, #502, #567).
//
// Branimir kept next month's cruise calls in the Backoffice, which meant a raw
// collection form with a venue field, sales counters and a public flag on it.
// These handlers are those jobs as named actions on Izvedbe.
//
// **Since #567 the two halves of the screen share the writing** (Q53): a
// voditelj and the secretary may both enter and correct both kinds of evening,
// because a season's schedule is one job and the two shapes of the form differ
// by what an evening IS (a house and a capacity, or a place and a client)
// rather than by who is typing. `mayWritePerformance` is the whole of the
// permission rule here, and it is the same predicate the screen offers its form
// from.
//
// What the halves do NOT share is the money and the buyers. Cancelling a public
// evening refunds every online order and mails every buyer (#497), moving its
// date or its house mails them too (#379, #94), the ledger is the till's own
// record and the pause stops a sale — every one of those is `tickets`, gated
// per ACTION in its own route and mapped for the screen by
// `performance-actions.ts`. Two rules in this file are the same fact from the
// inside: `handleCancelPerformance` stays the voditelj's and refuses a public
// row, and Uredi on a public row carries neither the date nor a house that has
// already sold a ticket.
//
// Pure + DI in the `note.ts` / `alarm.ts` shape: the cross-site guard first,
// then the permission, then the validation, then the work. The writes are the
// seam's (`getRepo().shows`), which puts them on Payload's local API so the
// Shows hooks keep telling the roster what changed.

import type { Permission } from '@/lib/access/permissions'
import { mayWritePerformance } from './performance-actions'
import {
  newPerformanceRow,
  newPublicPerformanceRow,
  parseNonPublicPerformance,
  parsePublicPerformance,
  parsePublicPerformanceEdit,
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
  /**
   * The caller's permission set, re-checked here rather than assumed from the
   * gate (#502, #567).
   *
   * The local API runs `overrideAccess: true`, so the collection's field access
   * never runs for these writes and the handler has to be the one that says no
   * (CLAUDE.md's hard rule). Since #567 what it says is one sentence — either
   * half of Izvedbe may write either kind of row — and the row-by-row split
   * that used to live here moved to the six named ACTIONS, where the money is.
   */
  permissions: readonly Permission[]
  /**
   * Active tickets on one performance, for the venue lock (#502 review).
   *
   * Asked only when Uredi is about to change the HOUSE of a public row, so the
   * common edit (a typo in the start time) costs no extra query. Active
   * tickets, not seats: a door line has no buyer to mail, so it is not what
   * makes a venue change a thing people have to be told about.
   */
  activeTickets: (id: string) => Promise<number>
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
 * May this caller enter or correct an izvedba at all (#567, Q53)?
 *
 * Since #567 the answer is the same for both kinds of row: a voditelj enters
 * the public evenings of a season as readily as the secretary enters a cruise
 * call, because a schedule is one job and the two shapes of the form differ by
 * what an evening IS rather than by who is typing it. What the two halves do
 * NOT share is the money and the buyers — cancelling a public evening, moving
 * its date or its house, the ledger and the pause are all `tickets` and are
 * gated per ACTION in their own routes (`performance-actions.ts`).
 *
 * `mayWritePerformance` is the same predicate the screen renders its form from,
 * so a form that is offered is a form this handler accepts.
 */
function mayWrite(deps: PerformanceFormDeps): boolean {
  return mayWritePerformance(deps.permissions)
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

/**
 * POST /api/app/performances — Dodaj izvedbu, both halves of it.
 *
 * The BODY says which KIND of evening is being added, and since #567 either
 * half of Izvedbe may add either kind (Q53): the screen is one register of the
 * season, and a voditelj who has the season's dates in front of them should not
 * have to hand them to the secretary to be typed a second time. What a public
 * row still costs is the actions attached to it — moving it, pausing it,
 * cancelling it — and those ask for `tickets` one at a time, where they live.
 *
 * The shape of the body is still checked against the kind: a public evening has
 * a house and may be a Redovna, a booking has a free-text place and a client
 * and may never be one (`performance-input.ts`, shared with the MCP tool).
 */
export async function handleCreatePerformance(
  body: unknown,
  deps: PerformanceFormDeps,
): Promise<PerformanceFormResult> {
  const rejection = guarded(deps)
  if (rejection) return rejection

  if (!mayWrite(deps)) return refuse(403, APP_STRINGS.performance.needsIzvedbe)

  if ((body as { isPublic?: unknown } | null)?.isPublic === true) {
    const parsed = parsePublicPerformance(body)
    if (!parsed.ok) return refuse(400, parsed.error)

    let row: NewPerformanceRow
    try {
      row = newPublicPerformanceRow(parsed.fields)
    } catch (err) {
      return refuse(
        400,
        err instanceof PerformanceValidationError ? err.message : APP_STRINGS.performance.failed,
      )
    }

    await deps.createPerformances([row])
    return ok({ date: parsed.fields.dateStr })
  }

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

/**
 * PATCH /api/app/performances/[id] — Uredi, either kind of row (#567), and
 * never a cancelled one.
 *
 * What may change is decided by the ROW and not by the caller: a booking's five
 * fields include its date, a public evening's three deliberately do not
 * (#379's reschedule mails every buyer and reissues every ticket), and the
 * house of a public evening that has sold a ticket moves through *Preseli u
 * zimsko*, which tells the buyers.
 *
 * The cancelled case is a **409** rather than a 400: the request is
 * well-formed and the row is the voditelj's, it is simply in a state where
 * this edit is not allowed — the same code and the same shape of refusal as a
 * confirmed postava. It matters because the Shows `afterChange` hook pushes
 * "izvedba je premještena" on a moved date, and pushing that at a roster that
 * has already been told the evening is off is worse than no edit at all. A
 * cancelled performance is a record; an evening that turns out to be back on
 * is a new one.
 */
export async function handleEditPerformance(
  rawId: unknown,
  body: unknown,
  deps: PerformanceFormDeps,
): Promise<PerformanceFormResult> {
  const rejection = guarded(deps)
  if (rejection) return rejection

  if (!mayWrite(deps)) return refuse(403, APP_STRINGS.performance.needsIzvedbe)

  const found = await loadOwned(rawId, deps, { nonPublicOnly: false })
  if ('refusal' in found) return found.refusal

  // A cancelled evening is a record, whichever kind it is. The reason is the
  // same on both halves: the Shows `afterChange` hook pushes "premještena" on a
  // changed row, and pushing that at a roster (or mailing it to buyers) who
  // have already been told the evening is off is worse than no edit at all.
  if (found.row.cancelled) {
    return refuse(409, APP_STRINGS.performance.cancelledNotEditable)
  }

  // ── A public evening: the hour, the house and the kind (#502, #567) ─────
  if (found.row.isPublic) {
    const parsed = parsePublicPerformanceEdit(body)
    if (!parsed.ok) return refuse(400, parsed.error)

    // The house of a SOLD evening is not a field (#502 review). Moving one is
    // `/api/shows/[id]/move-to-indoor`: it mails every buyer and stamps
    // `venue_changed_at`. Changing the column here instead would move the room,
    // tell nobody, and then hide the button that would have told them, because
    // "Preseli u zimsko" is only offered on a Ljetno row. A 409 rather than a
    // 403: the request is well-formed and the row IS theirs, it is simply in a
    // state where this particular edit is the wrong way to do it — the same
    // shape of refusal a cancelled row gets, and the message names the action
    // that is the right way.
    if (parsed.patch.venue !== found.row.venue) {
      if ((await deps.activeTickets(found.row.id)) > 0) {
        return refuse(409, APP_STRINGS.performance.venueLocked)
      }
    }

    await deps.updatePerformance(found.row.id, parsed.patch)
    return ok()
  }

  // ── A booking: the five fields, its date among them (#503, #567) ────────
  const parsed = parseNonPublicPerformance(body)
  if (!parsed.ok) return refuse(400, parsed.error)

  await deps.updatePerformance(found.row.id, performanceEditPatch(parsed.fields))
  return ok({ date: parsed.fields.dateStr })
}

/**
 * POST /api/app/performances/[id]/pause — Pauziraj / Nastavi online prodaju.
 *
 * The pause (#366) had no route of its own: it was a checkbox on the Shows
 * form in the Backoffice, and the only way to flip it from a phone was to open
 * the raw collection. This is that checkbox as a named action, and it writes
 * through the collection like every other Cecilija write so the Shows hooks
 * still run.
 *
 * It stops ONLINE checkout only. A partner still sells and the door still
 * sells, which is why the sheet says so: "pauzirano" must not read as
 * "cancelled" to the person pressing it.
 */
export async function handlePausePerformance(
  rawId: unknown,
  body: unknown,
  deps: PerformanceFormDeps,
): Promise<PerformanceFormResult> {
  const rejection = guarded(deps)
  if (rejection) return rejection

  const found = await loadOwned(rawId, deps, { nonPublicOnly: false })
  if ('refusal' in found) return found.refusal

  // A booking sells nothing, so it has no sale to pause: the collection zeroes
  // the flag on every non-public save anyway (#409), and writing it here would
  // be a change the hook silently undoes.
  if (!found.row.isPublic) return refuse(400, APP_STRINGS.performance.notPublicNoSales)

  const paused = (body as { paused?: unknown } | null)?.paused
  if (typeof paused !== 'boolean') return refuse(400, APP_STRINGS.performance.failed)

  await deps.updatePerformance(found.row.id, { onlineSalesPaused: paused })
  return ok()
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
