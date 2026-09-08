// Notification type (5): a "dolazim" withdrawn at the last minute (#436).
//
// The audience is the VODITELJI, not the roster, and the reason is operational
// rather than social: within a day of the performance a lost dancer has to be
// replaced by somebody making phone calls, and the app is the only thing that
// knows in time (#430, story 18).
//
// Four conditions, all of them necessary, all of them pure:
//
//   - The previous answer was `coming`. A dancer moving from "ne dolazim" to
//     "clear" has withdrawn nothing.
//   - The new state is anything else: `not_coming` OR cleared. A cleared answer
//     is the absence of a row (glossary: *Attendance*), and for a voditelj on
//     the evening before it means exactly what "ne dolazim" means.
//   - The DANCER did it themselves. A voditelj correcting somebody's row is
//     already the voditelj knowing, and a push telling them what they just
//     typed is noise (#436's acceptance criterion spells this out).
//   - The performance starts within 24 hours and has not started yet. Earlier
//     than that there is time and the headcount chip is enough; afterwards
//     there is nothing to chase.

import { PUSH_MESSAGES } from '@/lib/app/strings'
import { performanceUrl, untilStartTtlSeconds, type NotifiablePerformance } from './recipients'
import type { PushMessage } from './send'

/** How close to the start a withdrawal is worth waking a voditelj for. */
export const WITHDRAWAL_WINDOW_MS = 24 * 60 * 60 * 1000

export interface WithdrawalInput {
  /** The answer that stood before this write, or null when there was none. */
  previousStatus: 'coming' | 'not_coming' | null
  /** The answer that stands now; null means the row was cleared. */
  nextStatus: 'coming' | 'not_coming' | null
  /** True when the caller answered for their OWN Member row. */
  ownAnswer: boolean
  /** Epoch ms of the performance's start, Europe/Zagreb. */
  startMs: number
  nowMs: number
}

export function isWithdrawal(input: WithdrawalInput): boolean {
  if (input.previousStatus !== 'coming') return false
  if (input.nextStatus === 'coming') return false
  if (!input.ownAnswer) return false
  if (Number.isNaN(input.startMs)) return false
  const until = input.startMs - input.nowMs
  return until > 0 && until <= WITHDRAWAL_WINDOW_MS
}

export function buildWithdrawalMessage(
  performance: NotifiablePerformance,
  who: { memberId: string; nickname: string | null },
  nowMs: number = Date.now(),
): PushMessage {
  return {
    title: PUSH_MESSAGES.withdrawal.title,
    body: PUSH_MESSAGES.withdrawal.body({
      // A moreškant's nickname is required and unique (#420), so the fallback
      // is for a Member row that could not be read at all, not for a dancer
      // without one.
      who: who.nickname?.trim() || PUSH_MESSAGES.withdrawal.someone,
      date: performance.date,
      time: performance.time,
    }),
    url: performanceUrl(performance.id),
    // Per dancer, not per performance: two people dropping out of the same
    // evening are two facts a voditelj needs, not one replacing the other.
    tag: `withdrawal-${performance.id}-${who.memberId}`,
    ttlSeconds: untilStartTtlSeconds(performance, nowMs),
  }
}
