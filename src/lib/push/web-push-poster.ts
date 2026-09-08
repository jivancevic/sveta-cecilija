// The real poster: `web-push` with the deployment's VAPID keys (#431).
//
// The ONE module that imports `web-push`. Everything above it (`send.ts`,
// `alarm.ts`, `roster-notifications.ts`) takes the poster as a dependency, so
// the whole notification story is unit-tested with a fake and CI never opens a
// socket to Apple or Google. The keys themselves live in `./vapid.ts`, which
// the `/app` page imports without dragging this file's dependencies along.

import webpush from 'web-push'
import type { PushMessage, PushPostResult, PushSubscriptionRow } from './send'
import type { VapidConfig } from './vapid'

/**
 * A poster bound to this deployment's keys.
 *
 * It never throws: a push service's 4xx/5xx is an outcome, not an exception,
 * and `sendPushToUsers` decides what each status code means (410/404 → delete
 * the row, anything else → leave it alone).
 */
export function createWebPushPoster(
  config: VapidConfig,
): (subscription: PushSubscriptionRow, message: PushMessage) => Promise<PushPostResult> {
  return async (subscription, message) => {
    try {
      const res = await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(message),
        {
          vapidDetails: {
            subject: config.subject,
            publicKey: config.publicKey,
            privateKey: config.privateKey,
          },
          TTL: 60 * 60 * 12,
          urgency: 'high',
        },
      )
      return { ok: true, statusCode: res.statusCode }
    } catch (err) {
      const statusCode = (err as { statusCode?: unknown }).statusCode
      return { ok: false, statusCode: typeof statusCode === 'number' ? statusCode : undefined }
    }
  }
}
