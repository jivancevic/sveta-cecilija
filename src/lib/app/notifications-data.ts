// The IO wiring of the inbox screen (#496) — the `*-data.ts` shape.
//
// One function, because the screen is one read: this account's rows, newest
// first. The pool comes from the Payload instance the request already has
// (`poolQuery`), the same way every other raw-table reader gets it.
//
// A failure is an EMPTY inbox, not a 500. The screen is read after something
// happened, and an error page there would tell the reader nothing about the
// thing they came to see; the count in the header is already zero on the same
// failure, so the two agree.

import { getPayload } from 'payload'
import config from '@payload-config'
import {
  listNotifications,
  poolQuery,
  type AppNotification,
} from './notifications-store'

export interface NotificationInbox {
  rows: AppNotification[]
  /**
   * The server's clock, read HERE with the rows rather than in the component.
   * A page that read it during its own render would be impure (the lint rule
   * says so) and would let the browser relabel "danas" against a phone clock
   * that is wrong.
   */
  nowMs: number
}

export async function getMyNotifications(userId: string | null): Promise<NotificationInbox> {
  const nowMs = Date.now()
  if (!userId) return { rows: [], nowMs }
  try {
    const payload = await getPayload({ config })
    return { rows: await listNotifications(poolQuery(payload), userId), nowMs }
  } catch (err) {
    console.error('[app] notification inbox read failed', err)
    return { rows: [], nowMs }
  }
}
