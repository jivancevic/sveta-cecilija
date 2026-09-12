// The swallowing writer of the Sandučić obavijesti (#496).
//
// `notifications-store.ts` deliberately lets its errors escape — it is the
// table's SQL and a probe or a migration wants the truth. Every SENDER, though,
// files a row as a side effect of doing something more important: a push that
// reached twenty phones, an enquiry that is already stored, a chargeback whose
// money has already moved. None of those may fail because a row could not be
// written, and a Payload `afterChange` hook that threw here would fail the save
// itself.
//
// So there is one writer with the opposite contract, in its own file rather
// than inside the push wiring, so the two kinds that never push (a new inquiry,
// a new card dispute) can reach it without dragging `web-push` along.

import type { PoolQuery } from '@/lib/db/pool-query'
import type { AppNotificationKind } from './notification-audience'
import { insertNotifications } from './notifications-store'

export interface NotificationContent {
  kind: AppNotificationKind
  title: string
  body: string
  /** Where a tap lands. Always an internal `/app…` path. */
  url: string
}

/** Write one row per account. Never throws; returns how many landed. */
export async function fileNotifications(
  query: PoolQuery,
  content: NotificationContent,
  userIds: readonly string[],
): Promise<number> {
  if (userIds.length === 0) return 0
  try {
    return await insertNotifications(query, {
      userIds,
      kind: content.kind,
      title: content.title,
      body: content.body,
      url: content.url,
    })
  } catch (err) {
    console.error('[notifications] inbox write failed', content.kind, err)
    return 0
  }
}
