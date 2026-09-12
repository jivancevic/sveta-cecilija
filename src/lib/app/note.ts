// The voditelj note, edited from the pier (#436, #430 story 25).
//
// One rule decides everything here, and it is not in this file: the save goes
// THROUGH the Shows collection (`payload.update`), never through raw SQL, so
// the `afterChange` hook fires and the roster gets the same change notification
// an `/admin` save produces. A second writer would be a second behaviour, and
// the dancers would learn which one to trust.
//
// Pure + DI in the `alarm.ts` / `answer.ts` shape: the guard first, then the
// validation, then the work. `requirePermission(req, 'moreska')` is the route's
// job — a dancer must never be able to write a message to the whole roster.
//
// An empty note is stored as null rather than an empty string, so "no note" has
// one representation. The diff already treats the two as equal, which means
// clearing a note that was never set changes nothing and notifies nobody.

import { rejectAppRequest, type AppRequestMeta } from './request-guard'
import { APP_STRINGS } from './strings'

/** Long enough for "nađemo se na molu u 9:30, ponesite bijele košulje". */
export const MAX_NOTE_LENGTH = 2000

export interface NoteBody {
  performanceId?: unknown
  note?: unknown
}

export interface NoteDeps {
  request: AppRequestMeta
  /** True when the performance exists; false makes this a 400, never a 500. */
  performanceExists: (id: string) => Promise<boolean>
  saveNote: (id: string, note: string | null) => Promise<unknown>
}

export interface NoteResult {
  status: number
  body: { ok: true; note: string | null } | { error: string }
}

function id(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

/** POST /api/app/note. */
export async function handleNoteSave(
  body: NoteBody | null | undefined,
  deps: NoteDeps,
): Promise<NoteResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.push.rejected } }

  const performanceId = id(body?.performanceId)
  if (!performanceId) return { status: 400, body: { error: APP_STRINGS.note.missing } }

  if (body?.note != null && typeof body.note !== 'string') {
    return { status: 400, body: { error: APP_STRINGS.note.failed } }
  }

  const raw = typeof body?.note === 'string' ? body.note : ''
  if (raw.length > MAX_NOTE_LENGTH) {
    return { status: 400, body: { error: APP_STRINGS.note.tooLong } }
  }

  const note = raw.trim() === '' ? null : raw.trim()

  if (!(await deps.performanceExists(performanceId))) {
    return { status: 400, body: { error: APP_STRINGS.note.missing } }
  }

  await deps.saveNote(performanceId, note)
  return { status: 200, body: { ok: true, note } }
}
