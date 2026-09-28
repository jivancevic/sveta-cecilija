// Saving the Snimka's link (#692).
//
// The same shape as `note.ts`, and for the same reason: the write goes THROUGH
// the Shows collection so there is one writer of a shows row and the collection
// hooks keep running. What it deliberately does NOT do is ring anybody —
// `diffPerformance` watches five facts (date, time, place, cancelled, note) and
// `videoUrl` is not one of them, so a save produces an empty diff and no
// `performance_changed` push. That is the whole reason the ring is a second
// action with a second route: a voditelj fixing a typo must not be able to
// wake the roster.
//
// Three refusals, all 400, none of them a 500:
//
//   - the performance does not exist,
//   - it is a `koncert`, which Cecilija does not show at all (#635) and which
//     therefore has no screen a video could be watched from,
//   - what was pasted is not an `https://` link (`video-link.ts`).
//
// An empty body clears the link, and clearing is a legitimate save: a video
// comes down off YouTube and the evening goes back to having none. The inbox
// row that announced it stays, because it records that the video was out, not
// that it still is.

import { rejectAppRequest, type AppRequestMeta } from './request-guard'
import { APP_STRINGS } from './strings'
import { readVideoLink } from './video-link'

export interface VideoBody {
  performanceId?: unknown
  url?: unknown
}

/** What the route has to be able to tell this handler about the row. */
export interface VideoPerformance {
  kind: string
}

export interface VideoDeps {
  request: AppRequestMeta
  /** The row, or null when there is none. Null is a 400 here, never a 500. */
  loadPerformance: (id: string) => Promise<VideoPerformance | null>
  saveVideo: (id: string, url: string | null) => Promise<unknown>
}

export interface VideoResult {
  status: number
  body: { ok: true; url: string | null } | { error: string }
}

function id(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

/** POST /api/app/performances/[id]/video. The permission guard is the route's job. */
export async function handleVideoSave(
  body: VideoBody | null | undefined,
  deps: VideoDeps,
): Promise<VideoResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.push.rejected } }

  const performanceId = id(body?.performanceId)
  if (!performanceId) return { status: 400, body: { error: APP_STRINGS.video.missing } }

  const read = readVideoLink(body?.url)
  if (!read.ok) return { status: 400, body: { error: APP_STRINGS.video.invalid } }

  const performance = await deps.loadPerformance(performanceId)
  // A koncert is checked here rather than only hidden on the screen: the screen
  // it would be hidden on does not exist (a koncert detail is a 404), so this is
  // the only place the rule can live at all.
  if (!performance || performance.kind === 'koncert') {
    return { status: 400, body: { error: APP_STRINGS.video.missing } }
  }

  await deps.saveVideo(performanceId, read.url)
  return { status: 200, body: { ok: true, url: read.url } }
}
