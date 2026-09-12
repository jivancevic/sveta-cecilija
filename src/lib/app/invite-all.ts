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
  name?: unknown
  nickname?: unknown
  email?: unknown
  isMoreskant?: unknown
  active?: unknown
}

/** One member of the batch: the id to post, and what to call them in the toast. */
export interface BulkTarget {
  id: string
  /** Nickname, else name, else the id. Never an e-mail: the toast is a screen. */
  label: string
}

export interface BulkSelection {
  /** Members to invite, in the order they were given. */
  send: BulkTarget[]
  /**
   * Eligible dancers with no e-mail address on the row.
   *
   * Named rather than skipped silently: they are precisely the rows a voditelj
   * still has to do something about, and a summary that hid them would read as
   * "everybody is invited" while three dancers have no way in.
   */
  noEmail: BulkTarget[]
}

/** Nickname, else name, else the bare id, so a row is always addressable. */
export function bulkLabel(member: BulkMember): string {
  const nickname = typeof member.nickname === 'string' ? member.nickname.trim() : ''
  if (nickname) return nickname
  const name = typeof member.name === 'string' ? member.name.trim() : ''
  return name || String(member.id)
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
  const send: BulkTarget[] = []
  const noEmail: BulkTarget[] = []
  for (const member of members) {
    if (member?.id == null) continue
    const id = String(member.id)
    if (memberIdsWithLogin.has(id)) continue
    if (!isMoreskantRow(member as unknown as Record<string, unknown>)) continue
    // `active` defaults to true in the collection, so only an explicit false retires.
    if (member.active === false) continue
    const email = typeof member.email === 'string' ? member.email.trim() : ''
    const target = { id, label: bulkLabel(member) }
    if (!email) {
      noEmail.push(target)
      continue
    }
    send.push(target)
  }
  return { send, noEmail }
}

export interface BulkOutcome {
  sent: number
  /** Who was skipped for want of an address, by name. */
  noEmail: readonly string[]
  /** Who the send failed for, by name. */
  failed: readonly string[]
}

/** At most four names, then "i još N", so a toast stays a toast. */
export function nameList(names: readonly string[], max = 4): string {
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} ${APP_STRINGS.inviteAll.andMore(names.length - max)}`
}

/**
 * What the toast says: one clause per outcome that actually happened, and the
 * two bad outcomes NAME the dancers (#462 review).
 *
 * A count alone is unusable. `handleInvite` creates the login before it mails,
 * so a send that fails leaves an account behind; the next bulk press sees a
 * Member that "already has a login" and skips it forever. Naming the misses is
 * what lets a voditelj go and press "Pošalji pozivnicu" on those rows, which IS
 * idempotent and does re-mail them.
 *
 * Nothing at all to do is the good ending and gets its own sentence, not a
 * "poslano: 0" that reads like a failure.
 */
export function summariseBulkInvites(outcome: BulkOutcome): string {
  const parts: string[] = []
  if (outcome.sent > 0) parts.push(APP_STRINGS.inviteAll.sent(outcome.sent))
  if (outcome.noEmail.length > 0) {
    parts.push(APP_STRINGS.inviteAll.noEmail(nameList(outcome.noEmail)))
  }
  if (outcome.failed.length > 0) {
    parts.push(APP_STRINGS.inviteAll.failed(nameList(outcome.failed)))
  }
  return parts.length === 0 ? APP_STRINGS.inviteAll.none : parts.join(' ')
}
