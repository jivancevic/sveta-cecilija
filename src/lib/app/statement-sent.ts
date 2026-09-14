// **Označi poslanim** — the one write Obračun makes (#599).
//
// Pure + DI, in the `inquiries-handled.ts` shape: the cross-site guard, then
// the body, then the work, with the reads and the writes injected by the route.
//
// **A switch, not a toggle.** The body says what the month should BE
// (`{ sent: true }`), not what to do to it, so two taps from two devices agree,
// a retry after a flaky connection cannot flip a month back, and the undo is
// the same call with `false`. A `POST /toggle` would have none of those.
//
// **Marking sent FREEZES the month**, and that is the point of the action
// rather than a side effect of it. The statement is computed once, here, and
// stored; every later read of that month serves the stored document. Without
// it, raising a partner's commission rewrites months the accountant has already
// invoiced — which is the defect this action closes, not a hypothetical.
//
// **A month that has not ended cannot be sent.** Stamping August on the 20th of
// August would freeze eleven days of sales as if they were the month, and the
// partner would be invoiced for a fraction of what they owe. The refusal is a
// Croatian sentence rather than a disabled button alone, because the button
// lives on a screen and the rule lives on the route.
//
// **Un-sending is allowed**, for `finance` and nobody else — the route's gate,
// not this module's. A statement sent with a mistake in it has to be fixable,
// and the honest fix is to return the month to live and stamp it again.

import { rejectAppRequest, type AppRequestMeta } from './request-guard'
import { APP_STRINGS } from './strings'
import type { MonthKey } from './statement-view'

const S = APP_STRINGS.statement.sent

export interface MarkSentBody {
  partnerId?: unknown
  year?: unknown
  month?: unknown
  sent?: unknown
}

export interface MarkSentDeps {
  request: AppRequestMeta
  /** Today in Europe/Zagreb, resolved by the caller so this takes no clock. */
  now: MonthKey
  /** Is this a real Partner? null when the id names nobody. */
  loadPartner: (partnerId: string) => Promise<{ id: string } | null>
  /** Is the month already frozen? */
  isSent: (partnerId: string, year: number, month: number) => Promise<boolean>
  /** Compute and store the statement for the month. */
  freeze: (partnerId: string, year: number, month: number) => Promise<void>
  /** Return the month to live. */
  unfreeze: (partnerId: string, year: number, month: number) => Promise<void>
}

export interface MarkSentResult {
  status: number
  body: { ok: true; sent: boolean } | { error: string }
}

/**
 * Has `(year, month)` finished, in Europe/Zagreb? The clock is the caller's, so
 * this is a comparison and never a `new Date()`.
 */
export function monthHasEnded(now: MonthKey, year: number, month: number): boolean {
  return year * 12 + month < now.year * 12 + now.month
}

function asInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? ''))
  return Number.isInteger(n) ? n : null
}

/** POST /api/app/statement/sent. */
export async function handleMarkStatementSent(
  body: MarkSentBody | null | undefined,
  deps: MarkSentDeps,
): Promise<MarkSentResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: S.rejected } }

  if (body == null || typeof body !== 'object' || typeof body.sent !== 'boolean') {
    return { status: 400, body: { error: S.invalid } }
  }

  const partnerId = String(body.partnerId ?? '').trim()
  const year = asInt(body.year)
  const month = asInt(body.month)
  if (!partnerId || year == null || month == null || month < 1 || month > 12) {
    return { status: 400, body: { error: S.invalid } }
  }

  const partner = await deps.loadPartner(partnerId)
  if (!partner) return { status: 404, body: { error: S.noPartner } }

  const sent = body.sent
  const already = await deps.isSent(partnerId, year, month)

  // Already there: the same 200 without a write. Answering identically is what
  // makes this idempotent; skipping the write keeps `sent_at` honest about when
  // the month was actually stamped, which is the date on the covering e-mail.
  if (already === sent) return { status: 200, body: { ok: true, sent } }

  if (sent) {
    // The refusal is checked here rather than at the button, because the button
    // is a courtesy and the route is the rule.
    if (!monthHasEnded(deps.now, year, month)) {
      return { status: 409, body: { error: S.monthNotOver } }
    }
    await deps.freeze(partnerId, year, month)
  } else {
    await deps.unfreeze(partnerId, year, month)
  }

  return { status: 200, body: { ok: true, sent } }
}
