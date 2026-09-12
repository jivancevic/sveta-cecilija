// "Uredi kupca" — the one write Narudžbe makes (#501, #476's named field edit).
//
// Pure + DI, in the `note.ts` shape: the cross-site guard, then the validation,
// then the work, with the Payload calls injected by the route. What is NOT here
// is as much of the contract as what is:
//
//   - The counts, the total and the channel are what happened, not fields. A
//     miscount is corrected with an offline-sales line (ADR-0025) or a refund,
//     never by retyping a number on an order.
//   - `refundStatus` belongs to the refund engine and to the dispute handler,
//     which are the only two writers of it. A refunded order is closed here.
//   - The write goes through the Orders collection inside the seam, so the
//     collection hooks still run; this module never touches SQL.
//
// A blank address is stored as NULL rather than an empty string, so "this order
// has no e-mail" has one representation — the same one `sendOrderTicketEmail`
// already reads when it refuses to send.

import { isPlausibleEmail } from '@/lib/claim/claim-order'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'
import { APP_STRINGS } from './strings'

/** `orders.buyer_name` is a varchar; a real name is nowhere near this. */
export const MAX_BUYER_NAME = 200
/** The practical limit of an address Brevo will accept. */
export const MAX_BUYER_EMAIL = 254

export interface BuyerEditBody {
  buyerName?: unknown
  email?: unknown
}

/** The normalised pair, ready for the collection. */
export interface BuyerFields {
  buyerName: string
  /** NULL means the order has no address, which is a valid state. */
  email: string | null
}

export type BuyerNormalisation =
  | { ok: true; buyer: BuyerFields }
  | { ok: false; error: string }

/**
 * The field rules, alone, so the form and the route agree without sharing a
 * request. A name is required: this edit repairs a name typed wrong at the
 * door, and clearing one would erase the only thing a partner slip carries.
 */
export function normaliseBuyer(body: BuyerEditBody): BuyerNormalisation {
  const S = APP_STRINGS.orders.edit

  if (body.buyerName != null && typeof body.buyerName !== 'string') {
    return { ok: false, error: S.nameMissing }
  }
  if (body.email != null && typeof body.email !== 'string') {
    return { ok: false, error: S.emailInvalid }
  }

  const buyerName = (typeof body.buyerName === 'string' ? body.buyerName : '').trim()
  if (!buyerName) return { ok: false, error: S.nameMissing }
  if (buyerName.length > MAX_BUYER_NAME) return { ok: false, error: S.nameMissing }

  const raw = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase()
  if (raw === '') return { ok: true, buyer: { buyerName, email: null } }
  if (raw.length > MAX_BUYER_EMAIL || !isPlausibleEmail(raw)) {
    return { ok: false, error: S.emailInvalid }
  }

  return { ok: true, buyer: { buyerName, email: raw } }
}

export interface BuyerEditDeps {
  request: AppRequestMeta
  /** Enough of the order to refuse: null when there is no such row. */
  loadOrder: (id: string) => Promise<{ refunded: boolean } | null>
  saveBuyer: (id: string, buyer: BuyerFields) => Promise<unknown>
}

export interface BuyerEditResult {
  status: number
  body: { ok: true; buyerName: string; email: string | null } | { error: string }
}

/** PATCH /api/app/orders/[id]/buyer. */
export async function handleBuyerEdit(
  orderId: string,
  body: BuyerEditBody | null | undefined,
  deps: BuyerEditDeps,
): Promise<BuyerEditResult> {
  const S = APP_STRINGS.orders.edit

  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: S.rejected } }

  if (!orderId.trim()) return { status: 400, body: { error: S.notFound } }
  if (body == null || typeof body !== 'object') {
    return { status: 400, body: { error: S.nameMissing } }
  }

  const normalised = normaliseBuyer(body)
  if (!normalised.ok) return { status: 400, body: { error: normalised.error } }

  const order = await deps.loadOrder(orderId)
  if (!order) return { status: 404, body: { error: S.notFound } }
  if (order.refunded) return { status: 409, body: { error: S.refunded } }

  await deps.saveBuyer(orderId, normalised.buyer)
  return { status: 200, body: { ok: true, ...normalised.buyer } }
}
