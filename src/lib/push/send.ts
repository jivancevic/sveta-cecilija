// The one push sender (#431, ADR-0024 phase 4).
//
// Every notification the roster ever sends goes through `sendPushToUsers`: the
// alarm a voditelj taps, the automatic alarm and the T-48h reminder (#435), and
// the triggered notifications of #432. It takes a list of USER ids and one
// message, fans out over their devices, and reports what happened.
//
// The poster is injected, the Brevo-mail shape (`send-moreskant-email.ts`): the
// real one is `web-push` with VAPID keys (`./web-push-poster.ts`), the tests use
// a fake and never open a socket. Nothing in this file imports `web-push`, so
// it stays runnable in a plain vitest `node` environment.
//
// Two rules live here and nowhere else:
//
//   - A push service answering 404 or 410 means the subscription is GONE (the
//     browser was uninstalled, the user cleared site data, the endpoint
//     expired). That row is deleted, which is the whole of the table's
//     housekeeping (#430, story 8). Every other failure — a 500 from Apple, a
//     timeout — leaves the row alone: a device that is unreachable this minute
//     is not a device that no longer exists.
//   - One user, several devices, and a message is per user: a dancer with a
//     phone and a tablet is ONE recipient and TWO devices, and the voditelj's
//     "how many devices did that reach" (story 24) is the second number.
//
// A poster that throws is caught and counted as a failure. One dead endpoint
// must never abort the fan-out: the alarm exists precisely for the evening when
// something is already wrong.

/** One stored device. `keys` is the shape the Web Push API hands the browser. */
export interface PushSubscriptionRow {
  /** The row id, so a dead endpoint can be deleted without re-matching text. */
  id: string | number
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}

/** What a device shows. `url` is where a tap lands (`/app/performances/<id>`). */
export interface PushMessage {
  title: string
  body: string
  url: string
  /**
   * Collapse key. Two alarms for the same performance replace each other on the
   * lock screen rather than stacking, which is what a phone in a pocket wants.
   */
  tag: string
  /**
   * How long the push service may hold this message for a phone that is
   * offline. Decided by whoever built the message, because only they know what
   * the message is about: an alarm is worthless once the performance has begun,
   * while a reminder can wait out a night in a tunnel. The poster only forwards
   * it; omitted means the poster's own default.
   */
  ttlSeconds?: number
}

/** What a push service said. `statusCode` is absent when the poster threw. */
export interface PushPostResult {
  ok: boolean
  statusCode?: number
}

export interface SendPushDeps {
  /** Every device of every listed user. Order is irrelevant. */
  loadSubscriptions: (userIds: readonly string[]) => Promise<PushSubscriptionRow[]>
  post: (subscription: PushSubscriptionRow, message: PushMessage) => Promise<PushPostResult>
  /** Delete one row: the 404/410 cleanup. Failures are swallowed. */
  removeSubscription: (id: string | number) => Promise<void>
}

export interface SendPushResult {
  /** Users with at least one device that accepted the message. */
  recipients: number
  /** Devices the message was attempted on. */
  devices: number
  delivered: number
  /** Endpoints the push service reported gone; their rows are now deleted. */
  dead: number
  /** Temporary failures. The rows survive. */
  failed: number
}

/** 404 / 410: the subscription no longer exists and never will again. */
export function isDeadEndpoint(result: PushPostResult): boolean {
  return !result.ok && (result.statusCode === 404 || result.statusCode === 410)
}

export async function sendPushToUsers(
  userIds: readonly string[],
  message: PushMessage,
  deps: SendPushDeps,
): Promise<SendPushResult> {
  const unique = [...new Set(userIds.map(String).filter((id) => id !== ''))]
  const empty: SendPushResult = { recipients: 0, devices: 0, delivered: 0, dead: 0, failed: 0 }
  if (unique.length === 0) return empty

  const subscriptions = await deps.loadSubscriptions(unique)
  if (subscriptions.length === 0) return empty

  const reached = new Set<string>()
  let delivered = 0
  let dead = 0
  let failed = 0

  // Serial rather than Promise.all: a season's roster is twenty dancers with a
  // device or two each, and a burst of forty parallel TLS handshakes to three
  // push services buys nothing a for-loop does not already give.
  for (const subscription of subscriptions) {
    let result: PushPostResult
    try {
      result = await deps.post(subscription, message)
    } catch (err) {
      result = { ok: false, statusCode: statusOf(err) }
    }

    if (result.ok) {
      delivered++
      reached.add(String(subscription.userId))
      continue
    }

    if (isDeadEndpoint(result)) {
      dead++
      try {
        await deps.removeSubscription(subscription.id)
      } catch {
        // Housekeeping. A row that survives is retried (and deleted) next time.
      }
      continue
    }

    failed++
  }

  return {
    recipients: reached.size,
    devices: subscriptions.length,
    delivered,
    dead,
    failed,
  }
}

/**
 * `web-push` rejects with a `WebPushError` carrying `statusCode`, so a thrown
 * 410 is still a dead endpoint. Anything without one is a plain failure.
 */
function statusOf(err: unknown): number | undefined {
  const code = (err as { statusCode?: unknown } | null)?.statusCode
  return typeof code === 'number' ? code : undefined
}
