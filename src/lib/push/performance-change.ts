// What changed on a performance, and what that says on a phone (#436).
//
// Notification types (3) and (4) of the glossary: a saved change and a brand
// new performance. Both are decided HERE, purely, over two snapshots of the
// same row — the hook in `Shows.ts` only hands `previousDoc` and `doc` over and
// posts whatever comes back.
//
// Three rules live in this file and nowhere else:
//
//   - The watched set is exactly five facts: the date, the time, the PLACE
//     (which is the venue label on a public row and the free-text location on a
//     private one, so a booking moving from the pier to the cloister is one
//     change and not two fields), the cancelled status and the voditelj note.
//     Everything else on a Shows row — a sold counter ticking, a sales pause, a
//     threshold — is invisible to the roster, and a ticket sale must never ring
//     twenty phones.
//   - Only a performance still AHEAD of now notifies anybody (#430, story 20):
//     editing last month's note is bookkeeping.
//   - One save, one notification (story 19). There is no coalescing window and
//     no debounce: a voditelj who saves three times has changed their mind
//     three times, and a merged message would be a message about a state nobody
//     ever saw.

import { KIND_LABELS, PUSH_MESSAGES } from '@/lib/app/strings'
import { toRosterPerformance } from '@/lib/app/roster-loaders'
import type { PerformanceKind } from '@/lib/show-performance'
import { VENUE_LABEL, type Venue } from '@/lib/venues'
import { showStartMs } from '@/lib/show-time'
import { performanceUrl, untilStartTtlSeconds } from './recipients'
import type { PushMessage } from './send'

/** The only facts about a performance a change notification reasons about. */
export interface ChangeSnapshot {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, Europe/Zagreb wall clock. */
  time: string
  kind: PerformanceKind
  isPublic: boolean
  venue: Venue | null
  location: string | null
  cancelled: boolean
  voditeljNote: string | null
}

/** The five watched facts, in the order a message lists them. */
export type ChangedField = 'date' | 'time' | 'place' | 'cancelled' | 'note'

const FIELD_ORDER: ChangedField[] = ['date', 'time', 'place', 'cancelled', 'note']

/**
 * A Payload Shows doc → the snapshot.
 *
 * Built on `toRosterPerformance`, the projection `/app` already uses, so "which
 * place does this row have" is answered once for the cards, the detail page and
 * a notification alike: a public row carries a venue and no location, a private
 * one the reverse.
 */
export function toChangeSnapshot(doc: Record<string, unknown>): ChangeSnapshot {
  const p = toRosterPerformance(doc)
  return {
    id: p.id,
    date: p.date,
    time: p.time,
    kind: p.kind,
    isPublic: p.isPublic,
    venue: p.venue,
    location: p.location,
    cancelled: p.cancelled,
    voditeljNote: p.voditeljNote,
  }
}

/** The place as a dancer reads it: the venue's Croatian label, or the location. */
export function placeOf(snapshot: ChangeSnapshot): string {
  if (snapshot.isPublic) return snapshot.venue ? VENUE_LABEL.hr[snapshot.venue] : ''
  return snapshot.location ?? ''
}

/**
 * The watched fields that differ. Empty means "this save changed nothing the
 * roster can see", which is the common case: every ticket sale updates a Shows
 * row.
 */
export function diffPerformance(
  previous: ChangeSnapshot,
  next: ChangeSnapshot,
): ChangedField[] {
  const changed: ChangedField[] = []
  if (previous.date !== next.date) changed.push('date')
  if (previous.time !== next.time) changed.push('time')
  if (placeOf(previous) !== placeOf(next)) changed.push('place')
  if (previous.cancelled !== next.cancelled) changed.push('cancelled')
  if ((previous.voditeljNote ?? '') !== (next.voditeljNote ?? '')) changed.push('note')
  return FIELD_ORDER.filter((field) => changed.includes(field))
}

/** True when either half of the start instant moved. */
export function startMoved(changed: readonly ChangedField[]): boolean {
  return changed.includes('date') || changed.includes('time')
}

export function buildChangeMessage(
  next: ChangeSnapshot,
  changed: readonly ChangedField[],
  nowMs: number = Date.now(),
): PushMessage {
  const cancelledNow = changed.includes('cancelled') && next.cancelled
  const body = cancelledNow
    ? PUSH_MESSAGES.change.cancelledBody({ date: next.date, time: next.time })
    : PUSH_MESSAGES.change.body({
        date: next.date,
        time: next.time,
        // "otkazivanje je poništeno" only ever appears on the way back, because
        // the way there is a message of its own.
        fields: changed.map((field) =>
          field === 'cancelled'
            ? PUSH_MESSAGES.change.uncancelled
            : PUSH_MESSAGES.change.fields[field],
        ),
      })
  return {
    title: cancelledNow ? PUSH_MESSAGES.change.cancelledTitle : PUSH_MESSAGES.change.title,
    body,
    url: performanceUrl(next.id),
    // One tag per performance: two saves a minute apart replace each other on
    // the lock screen. The MESSAGES are still two (story 19) — what collapses
    // is the notification shade, and the later one wins, which is the one that
    // is true.
    tag: `change-${next.id}`,
    ttlSeconds: untilStartTtlSeconds(next, nowMs),
  }
}

export function buildNewPerformanceMessage(
  next: ChangeSnapshot,
  nowMs: number = Date.now(),
): PushMessage {
  return {
    title: PUSH_MESSAGES.created.title,
    body: PUSH_MESSAGES.created.body({
      date: next.date,
      time: next.time,
      kind: KIND_LABELS[next.kind] ?? next.kind,
      place: placeOf(next),
    }),
    url: performanceUrl(next.id),
    tag: `new-${next.id}`,
    ttlSeconds: untilStartTtlSeconds(next, nowMs),
  }
}

/** What a save is worth telling the roster, if anything. */
export type PerformanceNotification =
  | { kind: 'none'; changed: ChangedField[]; startMoved: boolean }
  | { kind: 'created'; message: PushMessage; changed: ChangedField[]; startMoved: false }
  | { kind: 'changed'; message: PushMessage; changed: ChangedField[]; startMoved: boolean }

/**
 * The whole decision behind the Shows `afterChange` hook.
 *
 * `startMoved` is reported even when nothing is sent, because it is a second
 * consequence with its own audience: a moved date invalidates the alarm and
 * reminder CLAIMS (`performance_notifications`), and those have to be released
 * whether or not a phone rings — a performance edited into the future from the
 * past sends nothing and still needs its claims cleared (#440 review).
 */
export function decidePerformanceNotification(input: {
  previous: ChangeSnapshot | null
  next: ChangeSnapshot
  nowMs: number
}): PerformanceNotification {
  const { previous, next, nowMs } = input
  const changed = previous ? diffPerformance(previous, next) : []
  const moved = startMoved(changed)

  // Story 20, the rule above every other rule here: an evening that has already
  // begun (or begun and finished) notifies nobody, create or update alike.
  const start = showStartMs(next.date, next.time)
  const ahead = !Number.isNaN(start) && start > nowMs
  if (!ahead) return { kind: 'none', changed, startMoved: moved }

  if (!previous) {
    return {
      kind: 'created',
      message: buildNewPerformanceMessage(next, nowMs),
      changed,
      startMoved: false,
    }
  }

  if (changed.length === 0) return { kind: 'none', changed, startMoved: moved }

  return {
    kind: 'changed',
    message: buildChangeMessage(next, changed, nowMs),
    changed,
    startMoved: moved,
  }
}
