// Registering and removing one device (#431).
//
// The pure half of `POST /api/app/push/subscribe` and
// `POST /api/app/push/unsubscribe`, in the `attendance/answer.ts` shape: the
// route file wires `requirePermission` (401/403) and the SQL, everything a test
// can ask about lives here.
//
// The `/app` cross-site guard runs FIRST and before any write, exactly as the
// answer route does: these are cookie-authenticated POSTs, which is the shape a
// cross-site `fetch` can aim at a signed-in dancer's browser. Cross-site → 403,
// a body that is not JSON → 415 (`src/lib/app/request-guard.ts`).
//
// A subscribe is an UPSERT ON THE ENDPOINT, not an insert, and that is the
// whole reason the endpoint is unique across the table rather than per user:
// the browser hands out the same endpoint every time until it expires, so a
// second tap, a re-registered service worker and a `pushsubscriptionchange`
// all have to converge on ONE row. Moving the row to the caller is deliberate
// too: if a dancer signs out of a shared phone and a voditelj signs in, the
// device must ring for the voditelj and not for the dancer who left.

import { rejectAppRequest, type AppRequestMeta } from '@/lib/app/request-guard'
import { APP_STRINGS } from '@/lib/app/strings'

/** The `PushSubscription.toJSON()` fields the browser posts. */
export interface SubscribeBody {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown } | null
}

export interface SubscribeDeps {
  request: AppRequestMeta
  /** The signed-in account. */
  userId: string
  /** `navigator.userAgent`, for telling one of a dancer's devices from another. */
  userAgent?: string | null
  /** Upsert on the endpoint; returns nothing. */
  saveSubscription: (row: {
    userId: string
    endpoint: string
    p256dh: string
    auth: string
    userAgent: string | null
  }) => Promise<void>
}

export interface UnsubscribeDeps {
  request: AppRequestMeta
  userId: string
  /** Delete this user's row for the endpoint. Returns how many rows went. */
  removeSubscription: (userId: string, endpoint: string) => Promise<number>
}

export interface SubscribeResult {
  status: number
  body: { ok: true } | { ok: true; removed: number } | { error: string }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function handlePushSubscribe(
  body: SubscribeBody | null | undefined,
  deps: SubscribeDeps,
): Promise<SubscribeResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.push.rejected } }

  const endpoint = text(body?.endpoint)
  const p256dh = text(body?.keys?.p256dh)
  const auth = text(body?.keys?.auth)
  // All three or none: a row without keys can never be encrypted to, so storing
  // one would only mean a permanently failing device in every fan-out.
  if (!endpoint || !p256dh || !auth) {
    return { status: 400, body: { error: APP_STRINGS.push.badRequest } }
  }

  await deps.saveSubscription({
    userId: String(deps.userId),
    endpoint,
    p256dh,
    auth,
    userAgent: text(deps.userAgent) || null,
  })

  return { status: 200, body: { ok: true } }
}

export async function handlePushUnsubscribe(
  body: SubscribeBody | null | undefined,
  deps: UnsubscribeDeps,
): Promise<SubscribeResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.push.rejected } }

  const endpoint = text(body?.endpoint)
  if (!endpoint) return { status: 400, body: { error: APP_STRINGS.push.badRequest } }

  // Scoped to the caller's own rows: an endpoint is a bearer-ish string, and
  // deleting by endpoint alone would let any signed-in account switch off
  // somebody else's phone. Removing nothing is still a 200 — the device wanted
  // to be off and it is off.
  const removed = await deps.removeSubscription(String(deps.userId), endpoint)
  return { status: 200, body: { ok: true, removed } }
}
