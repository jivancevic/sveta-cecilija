// The two numbers the confirmation sheet says out loud (#654) — the `*-data.ts`
// shape: everything that touches the database lives here, the rule itself is
// pure in `src/lib/push/roster-message.ts`.
//
// Through the seam (`getRepo()`, ADR-0027 decision 5) and so NOT on the
// allow-list in `repo-guard.test.ts`: the roster comes back as
// `repo.members.listMoreskanti()` and the two raw-table reads take
// `repo.db.query`, which is the same one-method `PoolQuery` the push store
// already wanted. A new screen's loader that reached for `getPayload` would be
// growing the list the list exists to shrink.
//
// They are read on the SERVER, when the screen renders, rather than counted in
// the browser from a list of dancers: the first number is devices and the
// second is accounts, and a client that could work either out would have to be
// handed the roster and the push table to do it.
//
// A failure reads as zeros. The sheet then says "Neće zazvoniti ni jedan
// mobitel" and the route answers 409 on the way through, which is a voditelj
// being told nothing will happen rather than a voditelj sending into the dark.

import { getRepo } from '@/lib/repo'
import { activeMoreskantIds, rosterMessageAudience } from '@/lib/push/roster-message'
import { countSubscriptions, loadUserIdsByMember } from '@/lib/push/store'

export interface RosterMessageCounts {
  /** Phones that would ring. A dancer with a phone and a tablet is two. */
  devices: number
  /** Accounts that would get a row: the "svih 76". */
  people: number
  /** Active moreškanti with no login at all, so the sheet never promises them. */
  withoutLogin: number
}

export const NO_ROSTER_MESSAGE_COUNTS: RosterMessageCounts = {
  devices: 0,
  people: 0,
  withoutLogin: 0,
}

export async function getRosterMessageCounts(): Promise<RosterMessageCounts> {
  try {
    const repo = getRepo()
    // `listMoreskanti()` returns the retired rows too, on purpose (Članovi lists
    // them). `rosterMessageAudience` drops them, which is where "every ACTIVE
    // moreškant" is decided — once, in a tested pure function.
    const members = await repo.members.listMoreskanti()
    const audience = rosterMessageAudience(
      members,
      await loadUserIdsByMember(repo.db.query, activeMoreskantIds(members)),
    )
    return {
      devices: await countSubscriptions(repo.db.query, audience.userIds),
      people: audience.userIds.length,
      withoutLogin: audience.withoutLogin,
    }
  } catch (err) {
    console.error('[app] roster message counts failed', err)
    return NO_ROSTER_MESSAGE_COUNTS
  }
}
