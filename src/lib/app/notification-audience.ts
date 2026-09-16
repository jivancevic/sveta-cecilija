// Who each notification reaches, and by which of the two channels (#496).
//
// The Sandučić obavijesti (CONTEXT.md) is per ACCOUNT, and every sender that
// rings a phone also files a row, so "who gets this" had to stop being an
// accident of which loader a sender happened to call. It is a table now:
//
//   - the **group** whose accounts the notification is addressed to. The three
//     groups are resolved differently and the words matter: dancers through
//     their `Users.member` link (a Member without a login is simply not in the
//     list, which is where a guest drops out), staff by holding `tickets`. The permission vocabulary itself
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
 *
 * `message` is the seventh (#654, ADR-0028) and the first that is NOT
 * event-driven: a voditelj writes a Croatian sentence to the roster from
 * Obavijesti. Every other kind is the system reporting something that happened
 * to it; this one is a person saying something. It is a kind rather than a
 * script because "javite e-mail i lozinku" will not be the last sentence
 * anybody has to send to seventy-six people.
 */
export const APP_NOTIFICATION_KINDS = [
  'alarm',
  'reminder',
  'performance_created',
  'performance_changed',
  /**
   * "Vodiš popis": one dancer has been put in charge of one evening's list
   * (#658). Addressed to exactly ONE account, which is what makes it unlike
   * every other roster kind — the caller resolves the candidate, as every
   * caller does, and here the list happens to be one name long.
   *
   * There is no matching kind for the delegation being TAKEN BACK, deliberately
   * (#658, Q13): a phone that buzzes to say something was removed is a phone
   * asking a question nobody can act on.
   */
  'list_keeper',
  'inquiry',
  'dispute',
  'message',
] as const

export type AppNotificationKind = (typeof APP_NOTIFICATION_KINDS)[number]

/**
 * The two ways an audience is resolved.
 *
 * There were three until #612 retired the withdrawal push, which was the only
 * kind addressed to the `voditelji`. The group went with it, loader and all:
 * an audience nothing is addressed to is not a way of resolving one, it is a
 * branch that cannot be reached and cannot be wrong in any way a test would
 * catch. A future voditelj-only notice adds it back in one line.
 */
export type NotificationAudienceGroup = 'roster' | 'staff'

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
  list_keeper: { group: 'roster', pushes: true, doorInbox: false },
  inquiry: { group: 'staff', pushes: false, doorInbox: false },
  dispute: { group: 'staff', pushes: false, doorInbox: false },
  // The voditelj's own sentence (#654). `roster`, because the audience is the
  // dancers and nobody else: the door holds no opinion on a rehearsal, and a
  // blagajna reading "javite e-mail" would be told to do something that is not
  // theirs to do. It pushes, because the whole point is reaching the phones
  // that can be reached; the inbox row is what reaches the rest.
  message: { group: 'roster', pushes: true, doorInbox: false },
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
