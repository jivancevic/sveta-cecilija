import { createHash } from 'node:crypto'

/**
 * Meta Conversions API (server-side) Purchase sender.
 *
 * The browser pixel (CookieConsent.tsx + MetaPixelPurchase.tsx) already fires a
 * `Purchase` event, but it's lost ~10-30% of the time to ad-blockers, iOS ITP,
 * or the tab closing before the beacon leaves. This sends the same Purchase
 * server-to-server from the Stripe webhook, which is never blocked.
 *
 * Deduplication: both channels carry the same `eventId` (`order_<orderId>`), so
 * Meta merges them into one event instead of double-counting. The browser side
 * passes it as `fbq('track', 'Purchase', params, { eventID })`.
 *
 * Pure + DI (injected `fetch`) so it unit-tests without a network call, mirroring
 * `postBrevoEmail`.
 */

export const META_CAPI_VERSION = 'v21.0'

export interface MetaPurchaseInput {
  /** Dataset / Pixel ID (same value the browser uses, NEXT_PUBLIC_META_PIXEL_ID). */
  pixelId: string
  /** CAPI access token (META_CAPI_ACCESS_TOKEN) — a secret, runtime env only. */
  accessToken: string
  /** Dedup key shared with the browser pixel, e.g. `order_1234`. */
  eventId: string
  /** Purchase value in major currency units (EUR, not cents). */
  value: number
  currency: string
  /** Buyer email — hashed (SHA-256, lower-cased, trimmed) before it leaves us. */
  email?: string
  orderId: string | number
  /** Page the purchase completed on; helps Meta's attribution. */
  eventSourceUrl?: string
  /** Unix seconds. Defaults to now; injectable so tests are deterministic. */
  eventTime?: number
}

export interface MetaCapiDeps {
  fetch: typeof globalThis.fetch
}

const sha256Lower = (s: string): string =>
  createHash('sha256').update(s.trim().toLowerCase()).digest('hex')

/**
 * POSTs a single `Purchase` event to the Conversions API. Throws on a non-2xx
 * response (the caller — the webhook — swallows it so Stripe never retries).
 */
export async function sendMetaPurchase(
  input: MetaPurchaseInput,
  deps: MetaCapiDeps,
): Promise<void> {
  const eventTime = input.eventTime ?? Math.floor(Date.now() / 1000)

  const userData: Record<string, unknown> = {}
  if (input.email) userData.em = [sha256Lower(input.email)]

  const body = {
    data: [
      {
        event_name: 'Purchase',
        event_time: eventTime,
        action_source: 'website',
        event_id: input.eventId,
        ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
        user_data: userData,
        custom_data: {
          value: input.value,
          currency: input.currency,
          order_id: String(input.orderId),
        },
      },
    ],
  }

  const url = `https://graph.facebook.com/${META_CAPI_VERSION}/${input.pixelId}/events?access_token=${encodeURIComponent(input.accessToken)}`

  const res = await deps.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Meta CAPI ${res.status}: ${text}`)
  }
}
