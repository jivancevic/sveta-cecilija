// The three marks on a Članovi row, decided (#653, ADR-0028).
//
// A voditelj standing in a hall wants three things per dancer and no more: is
// the app on their phone, will it ring, and can they get back in on their own.
// Until now the row answered none of them — it carried `hasLogin`, which says
// an account EXISTS and nothing about whether anybody ever opened it.
//
// Pure, beside `members-screen.ts` and in the same house style: the screen is a
// renderer, the rules are a table in `member-marks.test.ts`, and no database is
// needed to say what a signal means.
//
// Three decisions are worth stating here, because each is a place where an
// improvement would make the roster lie:
//
//  1. **`unknown` is a first-class answer, and only installed can be it.**
//     `app_devices` starts empty (#652), so on day one the whole install column
//     is `unknown` and must NOT read as "nobody has it". Notifications come off
//     `push_subscriptions`, which has been true and self-healing since it
//     shipped, so `notificationsAnswer` cannot return `unknown` and this file
//     does not fake it into one.
//  2. **The key is the PAIR, and it is not a half state.** ADR-0028 makes the
//     e-mail and the password one task, written by one form on Profil, and the
//     mark says that task is done: an address to send a reset to AND a password
//     the dancer chose. Reading only the address was the version that shipped
//     first and it lied about exactly the person the mark exists to catch — a
//     dancer who typed an address and skipped the password still carries the
//     random password their invitation minted, so they still cannot sign in on
//     a second phone, and the full key said otherwise. It is still ONE mark and
//     not two: the form writes both, so a reader who finishes it flips it on
//     the same render.
//
//     "Has a password" is not readable off the hash — every invited account has
//     one — so it is recorded at the moment it is chosen (`users.password_set_at`,
//     stamped by `PATCH /api/app/account` and cleared by "Resetiraj lozinku").
//  3. **"Never signed in" is a trace, not an absence of marks.** See
//     {@link everSignedIn}.

import {
  installedAnswer,
  notificationsAnswer,
  type DeviceAnswer,
  type DeviceSignal,
} from './device'

/**
 * What the roster knows about the account behind one dancer.
 *
 * Absent entirely (`null`) for a Member no login points at, which is the same
 * answer as an account that has never been opened: neither person has been in.
 */
export interface MemberAccountSignal {
  /**
   * Rows in `users.sessions` for this account.
   *
   * A session row is written by every way into Cecilija there is — the password
   * form, the invitation link, a voditelj approving a join claim — and by
   * nothing else, so a row is a trace only a sign-in can leave. It is also the
   * RETROACTIVE half of the answer: it has been written since #463, which is
   * why it, and not `app_devices`, is what keeps day one honest.
   */
  sessions: number
  /** The devices half (#652): `app_devices` and `push_subscriptions`, counted. */
  device: DeviceSignal
  /** Does `Users.email` carry an address? Half of the *Pristup* fact (#651). */
  hasEmail: boolean
  /**
   * Has this person ever CHOSEN a password? (`users.password_set_at`.)
   *
   * Never "is there a hash": `ensureDancerLogin` mints a random password on
   * every invitation, so the hash is set for the entire roster and would make
   * this constant true. The stamp is written only where a person types one.
   */
  hasOwnPassword: boolean
}

/** The three marks, one glyph per column. */
export interface MemberMarks {
  installed: DeviceAnswer
  notifications: DeviceAnswer
  /**
   * `yes` or `no` only: both halves of the key are facts the database knows,
   * so there is nothing here to be `unknown` about.
   */
  access: DeviceAnswer
}

/**
 * What a row shows on its right: three marks, or the words "nije ušao".
 *
 * A discriminated union rather than three nullable answers, because they are
 * genuinely two different rows: a dancer who has never been in gets no marks at
 * all, and what to do about it lives on their profile, where the two invitation
 * buttons already are. The list states the fact; it does not hand out an
 * instruction seventy-six times.
 */
export type MemberAccess = { kind: 'never-in' } | ({ kind: 'marks' } & MemberMarks)

/**
 * Has this person ever been inside Cecilija?
 *
 * The union of the two traces a signed-in account leaves, and the union is the
 * point:
 *
 *  - **a session row** covers everybody, all the way back to #463 — but
 *    "Odjava" deletes the row it was signed in on (`logoutOperation`), so a
 *    dancer who signed out is invisible to it;
 *  - **a device row** (#652) is never deleted, so it is permanent — but it has
 *    only existed since today, so on its own it would say "nije ušao" about the
 *    entire roster.
 *
 * Either one is proof, and the only person the pair still misses is a dancer
 * who signed in before #652, signed out, and has not opened the app since —
 * which is exactly a person a voditelj should be ringing anyway.
 */
export function everSignedIn(signal: MemberAccountSignal | null | undefined): boolean {
  if (!signal) return false
  return signal.sessions > 0 || signal.device.devices > 0
}

/**
 * Does this person hold a key of their own?
 *
 * BOTH halves, and the conjunction is the whole point (#653 review): an address
 * with no chosen password cannot sign anybody in on a second phone, and a
 * password with no address cannot be recovered when it is forgotten. ADR-0028
 * accepts that the second of those reads as incomplete; the first one reading
 * as COMPLETE was the mark lying about the person it exists to catch.
 *
 * Shared with Početna's card (`ownAccessPrompt`), so the list and the dancer's
 * own screen can never disagree about whether the task is done.
 */
export function ownsTheirAccess(input: {
  hasEmail: boolean
  hasOwnPassword: boolean
}): boolean {
  return input.hasEmail && input.hasOwnPassword
}

/**
 * One dancer's row, from one dancer's signal.
 *
 * `null` (no login points at this Member at all) and an account that was never
 * opened collapse into the same `never-in`, deliberately: for the voditelj
 * reading the list they are one situation, and the profile they land on offers
 * the same two invitation buttons for both.
 */
export function memberAccess(signal: MemberAccountSignal | null | undefined): MemberAccess {
  if (!everSignedIn(signal) || !signal) return { kind: 'never-in' }
  return {
    kind: 'marks',
    installed: installedAnswer(signal.device),
    notifications: notificationsAnswer(signal.device),
    access: ownsTheirAccess(signal) ? 'yes' : 'no',
  }
}

/** The three columns, in the order they are drawn. */
export const MEMBER_MARKS = ['installed', 'notifications', 'access'] as const
export type MemberMark = (typeof MEMBER_MARKS)[number]

/**
 * Is this person definitely missing this one thing?
 *
 * **Only a definite `no` counts, never an `unknown`.** That is what keeps the
 * chips honest on day one: the whole install column is `unknown` until the
 * phones report, so "bez appa" reads 0 rather than 76, and a voditelj is never
 * sent to ring seventy-six people about something nobody measured. A dancer who
 * has never been in is a definite no on all three, because they have no app, no
 * ring and no key of their own.
 */
export function isMissing(access: MemberAccess, mark: MemberMark): boolean {
  if (access.kind === 'never-in') return true
  return access[mark] === 'no'
}

/**
 * The four chips over the list (#653), each one a SET a voditelj can act on.
 *
 * "Who do I still have to ring" is a question about a set and not about a row,
 * which is why it is a chip and not a fourth symbol. `svi` is the default and
 * is never hidden. They replace #573's `svi · aktivni · bez prijave`: "bez
 * prijave" is now three sharper questions, and the active/retired split is
 * already in the ORDER of the list rather than behind a chip.
 */
export const MEMBER_FILTERS = ['all', 'no-app', 'no-push', 'no-access'] as const
export type MemberFilter = (typeof MEMBER_FILTERS)[number]

/** Which mark each chip is about; `all` is about none. */
export const FILTER_MARK: Record<MemberFilter, MemberMark | null> = {
  all: null,
  'no-app': 'installed',
  'no-push': 'notifications',
  'no-access': 'access',
}

/** Does this row survive the chip that is on? */
export function memberMatchesFilter(
  access: MemberAccess | null | undefined,
  filter: MemberFilter,
): boolean {
  const mark = FILTER_MARK[filter]
  if (mark === null) return true
  // A row whose signal could not be read (the load failed) is not evidence of
  // anything: it stays out of every "bez …" set rather than being counted as a
  // person to ring.
  if (!access) return false
  return isMissing(access, mark)
}

/**
 * Every chip's own count, over the rows the SEARCH left standing.
 *
 * Live, because a count that ignored the search box would send a voditelj into
 * a filter to find out it was empty — which is the whole reason the number is
 * on the chip in the first place.
 */
export function memberFilterCounts(
  rows: readonly { access: MemberAccess | null }[],
): Record<MemberFilter, number> {
  const counts = { all: rows.length, 'no-app': 0, 'no-push': 0, 'no-access': 0 }
  for (const row of rows) {
    for (const filter of MEMBER_FILTERS) {
      if (filter === 'all') continue
      if (memberMatchesFilter(row.access, filter)) counts[filter] += 1
    }
  }
  return counts
}
