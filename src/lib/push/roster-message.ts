// The voditelj's own sentence to the roster (#654, ADR-0028).
//
// Cecilija's other six notification kinds are the system reporting something
// that happened to it: a performance appeared, a start moved, an army is short,
// nobody answered, an enquiry arrived, a card was disputed. This is the seventh
// and the first that is not event-driven — a person writes Croatian and every
// active moreškant reads it.
//
// It exists as a KIND rather than as a script because #651's "set an e-mail and
// a password" will not be the last thing seventy-six people have to be told
// ("dođite u nedjelju u 18"), and a script is a thing only the developer can
// run.
//
// Three rules live here, all pure, all table-tested:
//
//   - **the audience is every ACTIVE moreškant**, and there is no recipient
//     picker: a picker is a screen for a case nobody has described. A dancer
//     with no login is where the audience shrinks, the same place it shrinks
//     for every other roster notification (`toUserIds`, #431), and the loader
//     reports how many that was so the sheet does not promise them;
//   - **the text is the body**, unedited. A voditelj writing to their own
//     roster is not a template;
//   - **the send is confirmed.** `confirmed: true` is required by the
//     validator, so a caller that skipped the sheet is refused rather than
//     quietly ringing dozens of phones. The sheet is where the two counts are
//     said out loud, and those counts are the receipt that stops somebody
//     sending the same sentence twice because they were not sure the first one
//     went through.
//
// The send itself goes through `deps.send` — `createSender` in `push-data.ts` —
// exactly as every other roster sender does, so the inbox row and the push stay
// ONE write and a partial push failure cannot cost anybody their row: the rows
// are filed first, `fileNotifications` never throws, and `sendPushToUsers`
// counts a dead or failing endpoint rather than aborting the fan-out. The
// handler catches even a total collapse of the push half for the same reason —
// the roster has already been told in the place the app promises to keep it.

import type { AttendanceMember } from '@/lib/attendance/rules'
import { rejectAppRequest, type AppRequestMeta } from '@/lib/app/request-guard'
import { APP_STRINGS, PUSH_MESSAGES } from '@/lib/app/strings'
import { toUserIds } from './recipients'
import type { PushMessage, SendPushResult } from './send'

/**
 * How long a message may be.
 *
 * A push notification is two lines on a lock screen and this is already far
 * past that: the limit is not a style guide, it is the point where a "message"
 * has become a document that belongs somewhere a person can scroll.
 */
export const ROSTER_MESSAGE_MAX = 500

/**
 * Where a tap lands: the inbox itself.
 *
 * Every other roster notification deep-links into the evening it is about
 * (`Stanje`, #566). This one is about nothing the app holds, so the honest
 * destination is the screen where the whole sentence is kept — the push body is
 * truncated on a lock screen, the row never is.
 */
export const ROSTER_MESSAGE_URL = '/app/notifications'

/** A message can wait out a night in a tunnel; a week is plenty (the bulk TTL). */
export const ROSTER_MESSAGE_TTL_SECONDS = 7 * 24 * 60 * 60

export interface RosterMessageAudience {
  /** Every active moreškant, login or not: the roster the message is about. */
  roster: number
  /** The accounts an inbox row is filed for, and whose devices are rung. */
  userIds: string[]
  /** Active moreškanti with no login. Nobody can be told; the count is honest about it. */
  withoutLogin: number
}

/**
 * The roster → who can actually be reached, in one pure pass.
 *
 * Inactive rows and non-dancers are dropped HERE as well as in the loader's
 * SQL, and that repetition is deliberate: the rule "an active moreškant" is
 * what the sheet's second number means, and a rule that only exists in a WHERE
 * clause is a rule no test can hold.
 */
export function rosterMessageAudience(
  members: readonly AttendanceMember[],
  userIdByMemberId: ReadonlyMap<string, string>,
): RosterMessageAudience {
  const memberIds = activeMoreskantIds(members)
  const userIds = toUserIds(memberIds, userIdByMemberId)
  return { roster: memberIds.length, userIds, withoutLogin: memberIds.length - userIds.length }
}

/** The audience as Member ids, which is what the login lookup is keyed on. */
export function activeMoreskantIds(members: readonly AttendanceMember[]): string[] {
  return [
    ...new Set(
      members
        .filter((member) => member.isMoreskant !== false && member.active !== false)
        .map((member) => String(member.id))
        .filter((id) => id !== '' && id !== 'undefined' && id !== 'null'),
    ),
  ]
}

export interface RosterMessageBody {
  text?: unknown
  confirmed?: unknown
}

export type RosterMessageRead = { ok: true; text: string } | { ok: false; error: string }

/**
 * The body a voditelj's browser sent → the sentence, or the refusal.
 *
 * `confirmed` is not decoration: the route is the only thing standing between a
 * typo and dozens of phones, and "the sheet said the numbers out loud" is the
 * one precondition this feature was designed around.
 */
export function readRosterMessage(body: RosterMessageBody | null | undefined): RosterMessageRead {
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (text === '') return { ok: false, error: APP_STRINGS.notifications.message.empty }
  if (text.length > ROSTER_MESSAGE_MAX) {
    return { ok: false, error: APP_STRINGS.notifications.message.tooLong(ROSTER_MESSAGE_MAX) }
  }
  if (body?.confirmed !== true) {
    return { ok: false, error: APP_STRINGS.notifications.message.unconfirmed }
  }
  return { ok: true, text }
}

/** The sentence as a push carrying its kind, so the row and the push are one write. */
export function buildRosterMessage(text: string): PushMessage {
  return {
    kind: 'message',
    title: PUSH_MESSAGES.message.title,
    body: text,
    url: ROSTER_MESSAGE_URL,
    // No collapse: two different sentences from a voditelj are two different
    // things to read, and a tag they shared would have the second replace the
    // first on the lock screen. The timestamp is what keeps them apart.
    tag: `message-${Date.now()}`,
    ttlSeconds: ROSTER_MESSAGE_TTL_SECONDS,
  }
}

export interface RosterMessageDeps {
  request: AppRequestMeta
  /** Every ACTIVE moreškant, login or not. */
  loadMoreskanti: () => Promise<AttendanceMember[]>
  /** Member id → the user id of that dancer's login, for those who have one. */
  loadUserIdsByMember: (memberIds: readonly string[]) => Promise<Map<string, string>>
  /** `createSender`: files the inbox rows, THEN pushes. */
  send: (userIds: readonly string[], message: PushMessage) => Promise<SendPushResult>
}

export interface RosterMessageResult {
  status: number
  body:
    | {
        ok: true
        /** Accounts that now hold a row. The second number on the sheet. */
        people: number
        /** Devices the message was attempted on. */
        devices: number
        /** Devices that actually took it. */
        delivered: number
        /** Active moreškanti with no login at all: told by nobody. */
        withoutLogin: number
      }
    | { error: string }
}

/** POST /api/app/notifications/message. `requirePermission(req, 'moreska')` is the route's job. */
export async function handleRosterMessage(
  body: RosterMessageBody | null | undefined,
  deps: RosterMessageDeps,
): Promise<RosterMessageResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.push.rejected } }

  const read = readRosterMessage(body)
  if (!read.ok) return { status: 400, body: { error: read.error } }

  const members = await deps.loadMoreskanti()
  const audience = rosterMessageAudience(
    members,
    await deps.loadUserIdsByMember(activeMoreskantIds(members)),
  )

  if (audience.userIds.length === 0) {
    return { status: 409, body: { error: APP_STRINGS.notifications.message.nobody } }
  }

  const message = buildRosterMessage(read.text)

  // The inbox rows are written INSIDE `deps.send`, before a single endpoint is
  // posted to, and they are written for the whole audience. So a push half that
  // collapses entirely — no VAPID keys, a push service refusing every device —
  // is reported as zero phones rung and never as a failed send: the roster has
  // been told, and answering 500 here would have a voditelj write the same
  // sentence again on top of seventy-six rows that already landed.
  let result: SendPushResult = { recipients: 0, devices: 0, delivered: 0, dead: 0, failed: 0 }
  try {
    result = await deps.send(audience.userIds, message)
  } catch (err) {
    console.error('[push] roster message fan-out failed', err)
  }

  return {
    status: 200,
    body: {
      ok: true,
      people: audience.userIds.length,
      devices: result.devices,
      delivered: result.delivered,
      withoutLogin: audience.withoutLogin,
    },
  }
}
