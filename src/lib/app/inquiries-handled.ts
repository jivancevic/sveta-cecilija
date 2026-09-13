// **Označi riješenim** — the one write Upiti makes (#507).
//
// Pure + DI, in the `orders-buyer.ts` shape: the cross-site guard, then the
// body, then the work, with the reads and the write injected by the route.
//
// The action is a SWITCH rather than a toggle, and the difference is the whole
// design. `{ handled: true }` says what the row should be, so two taps of the
// same button from two phones agree, a retried request after a flaky connection
// cannot flip the row back, and the undo is the same call with `false`. A
// `POST /toggle` would have none of those properties.
//
// What is NOT here: the enquiry's own fields. A stranger's name, address and
// message are a record of what they wrote, and nothing in this app rewrites
// one. The Backoffice keeps the raw edit for the day a typo has to be fixed.

import { rejectAppRequest, type AppRequestMeta } from './request-guard'
import type { InquiryState } from './inquiries-query'
import { APP_STRINGS } from './strings'

const S = APP_STRINGS.inquiries.actions

export interface MarkHandledBody {
  handled?: unknown
}

export interface MarkHandledDeps {
  request: AppRequestMeta
  /** Enough of the enquiry to refuse: null when there is no such row. */
  loadInquiry: (id: string) => Promise<{ status: InquiryState } | null>
  setHandled: (id: string, handled: boolean) => Promise<unknown>
}

export interface MarkHandledResult {
  status: number
  body: { ok: true; status: InquiryState } | { error: string }
}

/** POST /api/app/inquiries/[id]/handled. */
export async function handleMarkHandled(
  id: string,
  body: MarkHandledBody | null | undefined,
  deps: MarkHandledDeps,
): Promise<MarkHandledResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: S.rejected } }

  if (!id.trim()) return { status: 400, body: { error: S.notFound } }
  if (body == null || typeof body !== 'object' || typeof body.handled !== 'boolean') {
    return { status: 400, body: { error: S.invalid } }
  }

  const handled = body.handled
  const target: InquiryState = handled ? 'handled' : 'new'

  const inquiry = await deps.loadInquiry(id)
  if (!inquiry) return { status: 404, body: { error: S.notFound } }

  // Already there: answer the same 200 without a write. The result a caller
  // sees is what makes this idempotent; skipping the write only keeps the row's
  // `updated_at` honest about when its state last actually changed.
  if (inquiry.status !== target) await deps.setHandled(id, handled)

  return { status: 200, body: { ok: true, status: target } }
}
