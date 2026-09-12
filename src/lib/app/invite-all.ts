// "Pošalji pozivnice svima koji nemaju" (#462).
//
// The per-Member action (#424) leaves a voditelj to work out WHO is still
// missing by reading the "Ima prijavu" column down a list of tens of rows, and
// then to open each of them. This is that same action, once, for everybody it
// applies to.
//
// It adds NO invitation rule of its own: the route loops `handleInvite` over
// the members this module picks, so the four refusals, the idempotent reverse
// lookup and the seven-day link are still written once (`invite.ts`). What
// lives here is only the two things a bulk action has to decide for itself —
// who is in the batch, and what the voditelj is told afterwards.
//
// Pure, so both are table rows in invite-all.test.ts.

import { isMoreskantRow } from '@/lib/moreskant-profile'
import { APP_STRINGS } from './strings'

/** The Member fields the batch is chosen on. */
export interface BulkMember {
  id: string | number
  email?: unknown
  isMoreskant?: unknown
  active?: unknown
}

export interface BulkSelection {
  /** Members to invite, in the order they were given. */
  send: string[]
  /**
   * Eligible dancers with no e-mail address on the row.
   *
   * Counted rather than skipped silently: they are precisely the rows a
   * voditelj still has to do something about, and a summary that hid them would
   * read as "everybody is invited" while three dancers have no way in.
   */
  noEmail: string[]
}

/**
 * Split the roster into "invite now" and "cannot, no e-mail".
 *
 * A Member already carrying a login is simply not in the batch and is not
 * reported: re-inviting them would only mint a second link for an account that
 * works, which is what the per-row action is for when a letter goes missing.
 */
export function selectBulkInvites(
  members: readonly BulkMember[],
  memberIdsWithLogin: ReadonlySet<string>,
): BulkSelection {
  const send: string[] = []
  const noEmail: string[] = []
  for (const member of members) {
    if (member?.id == null) continue
    const id = String(member.id)
    if (memberIdsWithLogin.has(id)) continue
    if (!isMoreskantRow(member as unknown as Record<string, unknown>)) continue
    // `active` defaults to true in the collection, so only an explicit false retires.
    if (member.active === false) continue
    const email = typeof member.email === 'string' ? member.email.trim() : ''
    if (!email) {
      noEmail.push(id)
      continue
    }
    send.push(id)
  }
  return { send, noEmail }
}

export interface BulkOutcome {
  sent: number
  noEmail: number
  failed: number
}

/**
 * What the toast says: one clause per outcome that actually happened.
 *
 * Nothing at all to do is the good ending and gets its own sentence, not a
 * "poslano: 0" that reads like a failure.
 */
export function summariseBulkInvites(outcome: BulkOutcome): string {
  const parts: string[] = []
  if (outcome.sent > 0) parts.push(APP_STRINGS.inviteAll.sent(outcome.sent))
  if (outcome.noEmail > 0) parts.push(APP_STRINGS.inviteAll.noEmail(outcome.noEmail))
  if (outcome.failed > 0) parts.push(APP_STRINGS.inviteAll.failed(outcome.failed))
  return parts.length === 0 ? APP_STRINGS.inviteAll.none : parts.join(' ')
}
