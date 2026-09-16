// Putting one moreškant in charge of one evening's list, and taking it back
// (#658, ADR-0029).
//
// A SWITCH, not a toggle: the body says `keeps: true | false` and never "flip
// it". The same shape #507's *Označi riješenim* and #599's *Označi poslanim*
// use, and for the same reason — the undo is the same control, and a retry
// after a dropped connection cannot land the opposite of what the thumb meant.
//
// Who may press it is `moreska` and only `moreska`: a Zaduženi cannot pass the
// delegation on, because a delegation that chains is one nobody can follow. That
// is the route's `requirePermission`, not a rule here; what IS here is
// everything about the evening and the person.
//
// The push is part of this handler rather than of the route because whether it
// is sent is a RULE: appointing somebody rings their phone once, removing them
// rings nothing (#658, Q13). A send that fails never fails the write — being
// named is the fact, and a phone that missed the message is a phone whose owner
// will see the screen.
//
// Pure + DI, so all of it is tested without Payload, Postgres or a socket.

import { APP_STRINGS, PUSH_MESSAGES } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'
import { listKeeperIds, type ListKeeperRow } from './list-keeper'

export interface ListKeeperBody {
  memberId?: unknown
  keeps?: unknown
}

/** What the handler needs to know about the evening it is writing. */
export interface ListKeeperPerformance extends ListKeeperRow {
  id: string
  /** For the push sentence. Empty strings mean "say nothing about when". */
  date: string
  time: string
}

/** What it needs to know about the person being named. */
export interface ListKeeperCandidate {
  id: string
  active: boolean
  isMoreskant: boolean
}

export interface ListKeeperDeps {
  request: AppRequestMeta
  loadPerformance: (id: string) => Promise<ListKeeperPerformance | null>
  loadMember: (id: string) => Promise<ListKeeperCandidate | null>
  /** Writes the whole set. The handler hands the list it wants stored. */
  save: (performanceId: string, memberIds: string[]) => Promise<void>
  /**
   * The accounts linked to this Member — usually one, occasionally none (a
   * dancer with no login yet). Only called when somebody is being ADDED.
   */
  loadUserIdsByMember: (memberIds: readonly string[]) => Promise<string[]>
  /** Rings the phones and files the inbox rows. Never allowed to throw. */
  send: (
    userIds: readonly string[],
    message: { kind: 'list_keeper'; title: string; body: string; url: string; tag: string },
  ) => Promise<unknown>
}

export interface ListKeeperResult {
  status: number
  body: { ok: true; keepers: string[] } | { error: string }
}

function id(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

/**
 * POST /api/app/performances/[id]/list-keepers.
 *
 * 403/415 cross-site or not JSON; 400 for a body naming no member, an unknown
 * evening, or a person who is not a live moreškant; 200 with the set as stored.
 *
 * Idempotent in both directions: naming somebody already named, or removing
 * somebody who is not there, writes the same set and answers 200. Only an
 * actual ADDITION rings a phone, which is what keeps a double tap from buzzing
 * twice.
 */
export async function handleListKeeperWrite(
  performanceId: string,
  body: ListKeeperBody | null | undefined,
  deps: ListKeeperDeps,
): Promise<ListKeeperResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) {
    return { status: rejection.status, body: { error: APP_STRINGS.listKeepers.rejected } }
  }

  const memberId = id(body?.memberId)
  if (!performanceId || !memberId || typeof body?.keeps !== 'boolean') {
    return { status: 400, body: { error: APP_STRINGS.listKeepers.badRequest } }
  }

  const performance = await deps.loadPerformance(performanceId)
  if (!performance) return { status: 400, body: { error: APP_STRINGS.listKeepers.noPerformance } }

  const current = listKeeperIds(performance)
  const already = current.includes(memberId)

  // Only an ADDITION has to be a live dancer. Removing one who has since gone
  // inactive must keep working, or a row could never be tidied up once the
  // person it names left the roster.
  if (body.keeps && !already) {
    const member = await deps.loadMember(memberId)
    if (!member || !member.active || !member.isMoreskant) {
      return { status: 400, body: { error: APP_STRINGS.listKeepers.notMoreskant } }
    }
  }

  const next = body.keeps
    ? already
      ? current
      : [...current, memberId]
    : current.filter((existing) => existing !== memberId)

  if (next.length !== current.length) await deps.save(performanceId, next)

  if (body.keeps && !already) await ring(performanceId, memberId, performance, deps)

  return { status: 200, body: { ok: true, keepers: next } }
}

/**
 * One push, to one person, and never a reason to fail the write.
 *
 * The deep link is *Stanje* for that evening — the screen the new controls are
 * on — so the message answers "which evening" by opening it.
 */
async function ring(
  performanceId: string,
  memberId: string,
  performance: ListKeeperPerformance,
  deps: ListKeeperDeps,
): Promise<void> {
  try {
    const userIds = await deps.loadUserIdsByMember([memberId])
    if (userIds.length === 0) return
    await deps.send(userIds, {
      kind: 'list_keeper',
      title: PUSH_MESSAGES.listKeeper.title,
      body: PUSH_MESSAGES.listKeeper.body({ date: performance.date, time: performance.time }),
      url: `/app/moreska/${performanceId}`,
      tag: `list-keeper-${performanceId}`,
    })
  } catch (err) {
    console.error('[list-keepers] push failed', err)
  }
}
