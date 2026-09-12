// The army count (#422, ADR-0024; glossary: *Army count*).
//
// THE single home of the counting rule. The card chip, the performance detail
// and the phase 4 alarm all read this one function, so "3 bilih, 7 crnih" can
// never mean two different things in two places.
//
// The rule, spelled out once:
//   - only `coming` answers count;
//   - a king counts in his army and an otmanović in the crni army, because the
//     army a dancer is counted in is the `army` column, which the answer rules
//     already derived from the primary role (`rules.ts`);
//   - a **bula** is in neither army: they are listed separately and never move
//     a headcount;
//   - "no answer" is the ABSENCE of a row, so the list is the active moreškanti
//     minus everyone who has answered — a guest without a login included,
//     which is what lets a voditelj answer for them (#419, story 19);
//   - the headcount is compared to the performance's own thresholds
//     (`thresholdCrni` / `thresholdBili`, #408) and never states a shortfall.
//
// Pure over fixture rows: no Payload, no dates, no IO.

import { defaultArmyOf, type Army, type AttendanceMember } from './rules'

/** One stored answer, flattened to ids. */
export interface AttendanceRow {
  memberId: string
  status: 'coming' | 'not_coming'
  army: Army | null
}

/** A person in one of the lists the app renders. Mobiles yes, emails never. */
export interface RosterPerson {
  memberId: string
  nickname: string
  mobile: string | null
}

export interface ArmyTally {
  count: number
  threshold: number
  /** True when the army is short: what turns the card chip red. */
  below: boolean
  nicknames: string[]
  members: RosterPerson[]
}

export interface ArmyCount {
  crni: ArmyTally
  bili: ArmyTally
  /** Coming, but in neither army (a bula). */
  bula: RosterPerson[]
  /** Answered "ne dolazim". */
  notComing: RosterPerson[]
  /** Active moreškanti with no row at all. */
  noAnswer: RosterPerson[]
}

export interface ArmyThresholds {
  crni: number
  bili: number
}

function person(member: AttendanceMember): RosterPerson {
  return {
    memberId: String(member.id),
    nickname:
      typeof member.nickname === 'string' && member.nickname.trim() !== ''
        ? member.nickname.trim()
        : (member.name ?? String(member.id)),
    mobile: typeof member.mobile === 'string' && member.mobile.trim() !== '' ? member.mobile.trim() : null,
  }
}

function byNickname(a: RosterPerson, b: RosterPerson): number {
  return a.nickname.localeCompare(b.nickname, 'hr')
}

function tally(members: RosterPerson[], threshold: number): ArmyTally {
  const sorted = [...members].sort(byNickname)
  return {
    count: sorted.length,
    threshold,
    below: sorted.length < threshold,
    nicknames: sorted.map((m) => m.nickname),
    members: sorted,
  }
}

/**
 * Count one performance.
 *
 * `members` is the roster the count is taken over: every ACTIVE moreškant,
 * which the caller loads once for the whole season. Rows whose member is not in
 * that list (a dancer retired after answering) are ignored — they are not
 * dancing that evening, so they are not in any headcount, and they are not in
 * the no-answer list either.
 */
export function countArmies(
  rows: readonly AttendanceRow[],
  members: readonly AttendanceMember[],
  thresholds: ArmyThresholds,
): ArmyCount {
  const byId = new Map(members.map((m) => [String(m.id), m]))
  const crni: RosterPerson[] = []
  const bili: RosterPerson[] = []
  const bula: RosterPerson[] = []
  const notComing: RosterPerson[] = []
  const answered = new Set<string>()

  for (const row of rows) {
    const member = byId.get(String(row.memberId))
    if (!member) continue
    answered.add(String(row.memberId))
    if (row.status === 'not_coming') {
      notComing.push(person(member))
      continue
    }
    // A row saved before the army column existed, or a hand-edited NULL: fall
    // back to the same default the answer rules would have written.
    const army = row.army ?? defaultArmyOf(member)
    if (army === 'crni') crni.push(person(member))
    else if (army === 'bili') bili.push(person(member))
    else bula.push(person(member))
  }

  const noAnswer = members
    .filter((m) => !answered.has(String(m.id)))
    .map(person)
    .sort(byNickname)

  return {
    crni: tally(crni, thresholds.crni),
    bili: tally(bili, thresholds.bili),
    bula: [...bula].sort(byNickname),
    notComing: [...notComing].sort(byNickname),
    noAnswer,
  }
}
