// When the video notification was sent, for the receipt on the screen (#692).
//
// There is no "sent" column and there will not be one. The claim in
// `performance_notifications` IS the record: it is what refuses a second send,
// so reading it back is the only way the screen can be sure the sentence it
// prints ("Obavijest poslana: …") and the refusal a second press would get are
// the same fact. A boolean on `shows` would be a second copy, and the two would
// disagree the first time one write landed without the other.
//
// It reaches the database through `getRepo().db.query` (ADR-0027 decision 5), so
// it imports no Payload and needs no entry in the repo guard's allow-list; the
// SQL itself stays in `push/store.ts`, which owns that table.

import { getRepo } from '@/lib/repo'
import { readNotificationClaim } from '@/lib/push/store'

/**
 * The instant the roster was told about this evening's video, or null.
 *
 * Null is both "never sent" and "the read failed": a receipt that cannot be
 * read is drawn as absent rather than as an error, because the button beside it
 * is guarded by the claim itself and a screen that renders nothing here is
 * still correct — the worst case is a voditelj pressing a button that answers
 * 409, which is exactly what the lock is for.
 */
export async function getVideoNotifiedAt(performanceId: string): Promise<Date | null> {
  try {
    const repo = getRepo()
    const claim = await readNotificationClaim(repo.db.query, performanceId, 'video')
    return claim?.claimedAt ?? null
  } catch (err) {
    console.error('[video] reading the notification claim failed', err)
    return null
  }
}
