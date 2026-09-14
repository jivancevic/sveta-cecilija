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
  /** ISO of the odustajanje, when this row carries one (#609). */
  withdrewAt?: string | null
  /** True when the dancer withdrew, false when a voditelj wrote it down. */
  withdrewOwn?: boolean | null
}

/**
 * Somebody who said dolazim and took it back (#609; glossary: *Odustajanje*).
 *
 * A SUBSET of `notComing`, never a replacement for it: every other reader of
 * this count asks "is this person coming tonight", and for that question an
 * odustajanje is simply a no. Only Stanje separates the two, because only a
 * voditelj cares about the difference between a place that was never filled and
 * one that emptied out.
 */
export interface WithdrawnPerson extends RosterPerson {
  /** ISO. Stanje shows the time of day; the date is the evening's own. */
  withdrewAt: string
  /** False means a voditelj recorded it: the dancer phoned rather than vanished. */
  withdrewOwn: boolean | null
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
  /** Answered "ne dolazim". Includes everyone in `withdrawn`. */
  notComing: RosterPerson[]
  /**
   * The subset of `notComing` who had said dolazim first and let it stand
   * (#609). Newest first: a voditelj reading the night before wants the one
   * that just happened at the top, not the one from last Tuesday.
   */
  withdrawn: WithdrawnPerson[]
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
  const withdrawn: WithdrawnPerson[] = []
  const answered = new Set<string>()

  for (const row of rows) {
    const member = byId.get(String(row.memberId))
    if (!member) continue
    answered.add(String(row.memberId))
    if (row.status === 'not_coming') {
      const who = person(member)
      notComing.push(who)
      if (row.withdrewAt) {
        withdrawn.push({ ...who, withdrewAt: row.withdrewAt, withdrewOwn: row.withdrewOwn ?? null })
      }
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
    withdrawn: [...withdrawn].sort((a, b) => b.withdrewAt.localeCompare(a.withdrewAt)),
    noAnswer,
  }
}
