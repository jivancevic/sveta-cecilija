// The pure half of Gratis (#506), the comp-ticket screen.
//
// Nothing here is new policy. `/api/comp/issue` and `/api/comp/cancel` already
// carry every rule that matters — the member is required, the seats are counted
// inside the per-show advisory lock, a comp is voided with `storno` and never
// with a refund (ADR-0019). What lives in this file is the arithmetic and the
// wording decisions the screen makes on top of them, lifted out so the page,
// the form and the table agree and so they can be tested without a database.

import { stepperMax } from './partner-screen'

/** One row of the attribution picker: a Members row, as the screen reads it. */
export interface MemberOption {
  id: string
  name: string
}

/**
 * A name as the search compares it: lower case, and without its diacritics.
 *
 * Half the roster is spelled with Š, Ć, Ž or Đ and nobody reaches for those
 * on a phone keyboard while a guest is waiting, so "zuvela" has to find
 * "Žuvela". NFD splits a letter from its accent and the combining marks are
 * then dropped, which handles every Croatian diacritic except one.
 *
 * **Đ is the exception and needs its own line.** Unlike Č, Ć, Š and Ž it is not
 * a base letter plus a combining mark but a letter of its own (U+0110 / U+0111,
 * D with stroke), so NFD leaves it exactly as it was. Everyone types it as "d",
 * so the fold says so — otherwise Đuro is the one name on the roster the search
 * cannot find.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
}

/**
 * The members a typed query matches, in the order they were given.
 *
 * A substring rather than a prefix: the secretary is as likely to remember a
 * surname as a first name, and the roster is small enough that a loose match
 * shortens the list without flooding it.
 */
export function matchMembers(
  members: readonly MemberOption[],
  query: string,
): MemberOption[] {
  const needle = fold(query.trim())
  if (needle === '') return [...members]
  return members.filter((m) => fold(m.name).includes(needle))
}

// ── Podijeli gratis: the issue form ───────────────────────────────────────
//
// The seat maths is the partner sell's, because it IS the partner sell's: a
// comp consumes a real seat through the same active-ticket count and is
// capacity-guarded inside the same advisory lock (ADR-0019). `sellOptions` and
// `stepperMax` are reused rather than re-derived, so the number this form
// respects is the number Prodaja respects.

/**
 * The printed HOLDER name (ADR-0019's third name).
 *
 * Three names live around a comp and only this one is printed: the `member` is
 * who RECEIVED it and is internal, the claimed name is whoever scans it. This
 * one defaults to the member's and stays editable, so "for Ante's parents" can
 * be typed over "Ante" without touching the attribution.
 */
export function holderName({
  member,
  typed,
  edited,
}: {
  member: MemberOption | null
  typed: string
  /** True once the field has been touched: the prefill then stops overwriting. */
  edited: boolean
}): string {
  if (edited) return typed
  return member?.name ?? ''
}

/**
 * The name that actually goes on the slip, as the POST carries it.
 *
 * The field's hint says "Prazno znači ime člana", so an emptied field has to
 * SEND the member's name rather than null: `/api/comp/issue` stores what it is
 * given, so null would print a nameless slip and make the hint a lie. Null is
 * left for the one case where there is genuinely no name — no member picked and
 * nothing typed — which the submit button already refuses anyway.
 */
export function printedHolder(typed: string, member: MemberOption | null): string | null {
  const own = typed.trim()
  if (own !== '') return own
  const fallback = (member?.name ?? '').trim()
  return fallback === '' ? null : fallback
}

/** What the form may do, given what is on it. */
export interface CompIssueView {
  /** Seats left on the picked evening; 0 when none is picked. */
  remaining: number
  maxAdults: number
  maxChildren: number
  total: number
  overRemaining: boolean
  canSubmit: boolean
}

export function compIssueView({
  shows,
  showId,
  memberId,
  adults,
  children,
  busy = false,
}: {
  shows: readonly { id: string; remaining: number }[]
  showId: string
  memberId: string
  adults: number
  children: number
  busy?: boolean
}): CompIssueView {
  const remaining = shows.find((s) => s.id === showId)?.remaining ?? 0
  const total = adults + children
  const overRemaining = total > remaining
  return {
    remaining,
    // The two steppers share one pool: the adult ceiling moves as children are
    // added and back again, which is the courtesy half of the capacity rule.
    maxAdults: stepperMax(remaining, children),
    maxChildren: stepperMax(remaining, adults),
    total,
    overRemaining,
    canSubmit: showId !== '' && memberId !== '' && total > 0 && !overRemaining && !busy,
  }
}

// ── "Gratis po članu": the season report (ADR-0019) ────────────────────────
//
// Per-member reporting is the whole reason a comp carries a Member link rather
// than a scribbled note, so this is the table the decision was made for. It
// counts TICKETS, never money: a comp is `total = 0` by construction, and a SUM
// across the join to tickets would multiply an order's total by its party size
// (a bug this project has already had once).

/** One comp ticket of the season, flat, as the season query returns it. */
export interface CompTicketRow {
  memberId: string
  memberName: string
  type: 'adult' | 'child'
  /** A `storno` void: the seat came back, the record stays. */
  cancelled: boolean
}

/** One line of "Gratis po članu". */
export interface CompMemberTally {
  memberId: string
  memberName: string
  /** Live adult seats; a voided one is counted in `voided` and nowhere else. */
  adults: number
  children: number
  /** Live tickets: what the member actually received this season. */
  issued: number
  /** Voided tickets: issued in error, or cancelled afterwards. */
  voided: number
}

/**
 * The season's comps, one line per member, most comps first.
 *
 * The aggregation is here rather than in SQL because it is a rule about what
 * counts as issued — and a rule, unlike a join, is worth a test. The query
 * below it stays a plain "every comp ticket of this season" read.
 */
export function tallyCompsByMember(rows: readonly CompTicketRow[]): CompMemberTally[] {
  const byMember = new Map<string, CompMemberTally>()

  for (const row of rows) {
    let tally = byMember.get(row.memberId)
    if (!tally) {
      tally = {
        memberId: row.memberId,
        memberName: row.memberName,
        adults: 0,
        children: 0,
        issued: 0,
        voided: 0,
      }
      byMember.set(row.memberId, tally)
    }
    if (row.cancelled) {
      tally.voided += 1
      continue
    }
    tally.issued += 1
    if (row.type === 'child') tally.children += 1
    else tally.adults += 1
  }

  return [...byMember.values()].sort(
    (a, b) => b.issued - a.issued || a.memberName.localeCompare(b.memberName, 'hr'),
  )
}
