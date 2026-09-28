// "Video s nastupa" — the one ring per evening (#692).
//
// This is #654's roster message with a lock bolted on, and the lock is the whole
// design. Saving a link rings nobody, so a typo costs nothing; pressing this
// rings every phone on the roster and can never be pressed again for the same
// evening. The lock is not a flag on the row: it is a claim in
// `performance_notifications`, the same `(performance_id, type)` unique index
// that has stopped the alarm and the reminder from firing twice since #431. So
// the receipt on the screen and the thing that prevents a second send are ONE
// record, and there is no second place for them to disagree.
//
// Two orderings in here are load-bearing.
//
//   - The audience is resolved BEFORE the claim. A roster with nobody who can
//     be reached is a 409 that must leave the claim untaken, or the first press
//     on a night when no dancer has a login would burn the evening's one ring.
//   - The claim is taken BEFORE the send, the same call `roster-notifications`
//     makes for the alarm. A crash between the two means the receipt says sent
//     and nobody was rung, which a voditelj discovers and can work around; the
//     other order means a retry rings seventy-six phones twice, which nobody
//     can undo. Losing a send is recoverable, un-ringing a phone is not.
//
// A push that collapses entirely is still a 200, for #654's reason: the inbox
// rows are filed inside `deps.send` before a single endpoint is posted to, so
// the roster HAS been told and answering 500 would have a voditelj press it
// again on top of rows that already landed. The claim is kept for exactly the
// same reason.

import { rejectAppRequest, type AppRequestMeta } from '@/lib/app/request-guard'
import { APP_STRINGS, PUSH_MESSAGES } from '@/lib/app/strings'
import { kindWord } from '@/lib/app/performance-kind'
import { hasVideo } from '@/lib/app/video-link'
import { performanceUrl } from './recipients'
import type { PushMessage, SendPushResult } from './send'

/** A video can wait out a night in a tunnel; a week, like the roster message. */
export const VIDEO_TTL_SECONDS = 7 * 24 * 60 * 60

/** What the ring needs to know about the evening it is about. */
export interface VideoPerformanceFacts {
  id: string
  date: string
  kind: string
  /**
   * Required, not optional: a loader that forgets to read the column would
   * otherwise silently hand over `undefined` and every ring would refuse with
   * `noLink`. `tsc` is the right place to find that, the same reason
   * `CollectedOrderRow` carries its channel as a required field.
   */
  videoUrl: string | null
}

export interface VideoNotificationBody {
  confirmed?: unknown
}

/**
 * The message, carrying its kind so the push and the inbox row are one write.
 *
 * The tag COLLAPSES per performance, unlike #654's message. It is safe here
 * precisely because of the claim: there is only ever one of these per evening,
 * so nothing of the reader's can be replaced by it. Two different evenings
 * carry two different tags and both survive.
 */
export function buildVideoMessage(performance: VideoPerformanceFacts): PushMessage {
  return {
    kind: 'video',
    title: PUSH_MESSAGES.video.title,
    body: PUSH_MESSAGES.video.body({
      kind: kindWord(performance.kind),
      date: performance.date,
    }),
    // Stanje, never YouTube. An inbox row is read months later and a stored
    // external link can die; `/app/moreska/<id>` cannot. And a dancer opening
    // this after the evening wants the postava too.
    url: performanceUrl(performance.id),
    tag: `video-${performance.id}`,
    ttlSeconds: VIDEO_TTL_SECONDS,
  }
}

export interface VideoNotificationDeps {
  request: AppRequestMeta
  /** The evening, or null when the id names nothing. */
  loadPerformance: () => Promise<VideoPerformanceFacts | null>
  /** Every account on the roster that can hold a row, already resolved. */
  loadAudience: () => Promise<{ userIds: string[]; withoutLogin: number }>
  /** `INSERT … ON CONFLICT DO NOTHING`: true when THIS caller won the claim. */
  claim: () => Promise<boolean>
  /** `createSender`: files the inbox rows, THEN pushes. */
  send: (userIds: readonly string[], message: PushMessage) => Promise<SendPushResult>
  /** Cosmetic: record how many devices it reached, on the claim we already hold. */
  finalize: (devices: number) => Promise<void>
}

export interface VideoNotificationResult {
  status: number
  body:
    | { ok: true; people: number; devices: number; delivered: number; withoutLogin: number }
    | { error: string }
}

/** POST /api/app/performances/[id]/video/notify. The permission guard is the route's job. */
export async function handleVideoNotification(
  body: VideoNotificationBody | null | undefined,
  deps: VideoNotificationDeps,
): Promise<VideoNotificationResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.push.rejected } }

  const S = APP_STRINGS.video.ring

  // The sheet is the only thing between a mis-tap and dozens of phones, and
  // unlike #654's there is no second chance to correct it.
  if (body?.confirmed !== true) return { status: 400, body: { error: S.unconfirmed } }

  const performance = await deps.loadPerformance()
  if (!performance) return { status: 400, body: { error: APP_STRINGS.video.missing } }
  if (!hasVideo(performance.videoUrl)) return { status: 400, body: { error: S.noLink } }

  const audience = await deps.loadAudience()
  if (audience.userIds.length === 0) return { status: 409, body: { error: S.nobody } }

  if (!(await deps.claim())) return { status: 409, body: { error: S.already } }

  let result: SendPushResult = { recipients: 0, devices: 0, delivered: 0, dead: 0, failed: 0 }
  try {
    result = await deps.send(audience.userIds, buildVideoMessage(performance))
  } catch (err) {
    console.error('[push] video notification fan-out failed', err)
  }

  // Never allowed to fail the send it is only describing.
  try {
    await deps.finalize(result.devices)
  } catch (err) {
    console.error('[push] video notification finalize failed', err)
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
