// Who each notification reaches, and by which of the two channels (#496).
//
// The Sandučić obavijesti (CONTEXT.md) is per ACCOUNT, and every sender that
// rings a phone also files a row, so "who gets this" had to stop being an
// accident of which loader a sender happened to call. It is a table now:
//
//   - the **group** whose accounts the notification is addressed to. The three
//     groups are resolved three different ways and the words matter: dancers
//     through their `Users.member` link (a Member without a login is simply not
//     in the list, which is where a guest drops out), voditelji by holding
//     `moreska`, staff by holding `tickets`. The permission vocabulary itself
//     stays `src/lib/access/permissions.ts`'s — the strings below are VALUES of
//     that enum, never a second copy of it;
//   - whether the kind **pushes** at all. The two staff kinds do not: an
//     inquiry and a chargeback are read at a desk, and a phone that buzzed for
//     every enquiry would be muted within a week;
//   - whether a **`door`-only holder** is filed a row. That was the open
//     question of the route map's fog (#473 Q15) and #496 settled it: a row,
//     never a push, and only for the notifications about the EVENING itself.
//     The roster's alarm and its answer reminder stay roster-only, because
//     "javi dolazak" is not a question the person on the gate can answer.
//
// Pure: the candidate lists arrive already resolved, so the whole rule is
// table-tested without Payload, Postgres or a socket.

/**
 * Every kind the inbox stores. It is deliberately NOT the push table's `type`
 * (`alarm | reminder`, the once-per-performance claim): that enumerates the two
 * SCHEDULED sends, while this enumerates everything a person can be told.
 *
 * An ORDER is never one of them (#496): a sale is not news, it is a number on
 * the Narudžbe screen, and an inbox that filled up with them would bury the two
 * kinds a secretary actually has to act on.
 */
export const APP_NOTIFICATION_KINDS = [
  'alarm',
  'reminder',
  'performance_created',
  'performance_changed',
  'inquiry',
  'dispute',
] as const

export type AppNotificationKind = (typeof APP_NOTIFICATION_KINDS)[number]

/**
 * The three ways an audience is resolved.
 *
 * `voditelji` has no kind mapped to it since the withdrawal push was retired
 * (#612). It stays in the union because it is a way an audience CAN be
 * resolved, not a list of what is switched on today.
 */
export type NotificationAudienceGroup = 'roster' | 'voditelji' | 'staff'

export interface AudienceRule {
  group: NotificationAudienceGroup
  /** Does this kind ring a phone, or is the inbox its only channel? */
  pushes: boolean
  /** Does a `door`-only holder get the row? Never the push, either way. */
  doorInbox: boolean
}

/** The kinds a `door`-only holder is filed. See the header note. */
export const DOOR_INBOX_KINDS: readonly AppNotificationKind[] = [
  'performance_created',
  'performance_changed',
]

const RULES: Record<AppNotificationKind, AudienceRule> = {
  alarm: { group: 'roster', pushes: true, doorInbox: false },
  reminder: { group: 'roster', pushes: true, doorInbox: false },
  performance_created: { group: 'roster', pushes: true, doorInbox: true },
  performance_changed: { group: 'roster', pushes: true, doorInbox: true },
  inquiry: { group: 'staff', pushes: false, doorInbox: false },
  dispute: { group: 'staff', pushes: false, doorInbox: false },
}

export function audienceFor(kind: AppNotificationKind): AudienceRule {
  return RULES[kind]
}

/** A narrowing guard, for a `kind` that arrived as text from a column or a body. */
export function isAppNotificationKind(value: unknown): value is AppNotificationKind {
  return typeof value === 'string' && (APP_NOTIFICATION_KINDS as readonly string[]).includes(value)
}

export interface AudienceCandidates {
  /** The group's accounts, already resolved by the caller. */
  primary: readonly string[]
  /**
   * Accounts holding `door` and nothing that already puts them in a group.
   * Ignored by every kind outside `DOOR_INBOX_KINDS`.
   */
  doorOnly: readonly string[]
}

export interface ResolvedAudience {
  /** Accounts whose devices are rung. A subset of `inbox`, always. */
  push: string[]
  /** Accounts that get a row. Never empty when `push` is not. */
  inbox: string[]
}

function clean(ids: readonly string[]): string[] {
  return [...new Set(ids.map(String).filter((id) => id !== ''))]
}

/**
 * The two channels for one kind: whose phones ring, and whose inbox gets a row.
 *
 * `inbox` is a superset of `push` by construction, which is the invariant the
 * bell depends on — a notification a person was pushed and cannot then find in
 * their inbox is the defect this whole table exists to prevent.
 */
export function resolveNotificationAudience(
  kind: AppNotificationKind,
  candidates: AudienceCandidates,
): ResolvedAudience {
  const rule = audienceFor(kind)
  const primary = clean(candidates.primary)
  const inbox = rule.doorInbox ? clean([...primary, ...candidates.doorOnly]) : primary
  return { push: rule.pushes ? primary : [], inbox }
}
