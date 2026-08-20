// Internal "a chargeback was opened" alert (#380). Goes to the org inbox, never
// to the buyer — a disputed charge is an ops task with a hard deadline
// (`evidence_details.due_by`), and the only ways to respond are inside the
// Stripe dashboard. Fires through the single Brevo seam (postBrevoEmail) like
// every other mail path, so the staging kill switch applies here too (ADR-0009).
import { postBrevoEmail } from './post-brevo-email'

export interface DisputeNotificationEmailInput {
  disputeId: string
  paymentIntentId: string | null
  amountCents: number
  currency: string
  reason: string
  status: string
  /** ISO 8601 UTC evidence deadline, or null when Stripe gave none. */
  evidenceDueBy: string | null
  order: {
    id: string
    code: string | null
    buyerName: string | null
    email: string | null
    total: number
  } | null
}

export interface SendDisputeNotificationDeps {
  fetch: typeof fetch
  brevoApiKey: string
  /** Defaults to process.env.DEV_EMAIL_OVERRIDE; injectable for tests. */
  devEmailOverride?: string | null
}

const SENDER = { email: 'tickets@moreska.eu', name: 'Moreška website' }
const TO = { email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' }

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
}

/** `2026-08-30 14:05 UTC` — unambiguous for a deadline, no locale guessing. */
function deadline(iso: string | null): string {
  if (!iso) return 'not stated by Stripe'
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

export async function sendDisputeNotification(
  input: DisputeNotificationEmailInput,
  deps: SendDisputeNotificationDeps,
): Promise<void> {
  const orderLabel = input.order?.code
    ? `order ${input.order.code}`
    : input.order
      ? `order #${input.order.id}`
      : 'UNKNOWN ORDER'
  const subject = `Chargeback opened: ${orderLabel} (${money(input.amountCents, input.currency)})`

  const rows: [string, string][] = [
    ['Order', orderLabel],
    ['Buyer', input.order?.buyerName || '—'],
    ['Buyer email', input.order?.email || '—'],
    ['Disputed amount', money(input.amountCents, input.currency)],
    ['Order total', input.order ? money(input.order.total, input.currency) : '—'],
    ['Reason', input.reason],
    ['Status', input.status],
    ['Respond by', deadline(input.evidenceDueBy)],
    ['Dispute id', input.disputeId],
    ['Payment intent', input.paymentIntentId ?? '—'],
  ]

  const html = `
<div style="font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;color:#1a1a1a;font-size:15px;line-height:1.55;">
  <p style="margin:0 0 12px 0;"><strong>A chargeback was opened on a Moreška ticket order.</strong></p>
  <p style="margin:0 0 12px 0;">Respond in the Stripe dashboard before <strong>${esc(deadline(input.evidenceDueBy))}</strong>, or the dispute is lost by default.</p>
  <table cellpadding="0" cellspacing="0" border="0" style="font-size:14px;">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:2px 12px 2px 0;color:#777;">${esc(k)}</td><td>${esc(v)}</td></tr>`,
      )
      .join('\n    ')}
  </table>
  <p style="margin:16px 0 0 0;color:#777;font-size:13px;">If the dispute is lost, the site marks the order refunded and voids its tickets automatically, so the seats free up and the QR codes stop scanning.</p>
</div>`.trim()

  const res = await postBrevoEmail(
    { sender: SENDER, to: [TO], subject, htmlContent: html },
    {
      fetch: deps.fetch,
      brevoApiKey: deps.brevoApiKey,
      devEmailOverride: deps.devEmailOverride,
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Brevo dispute notification failed status=${res.status} body=${text}`)
  }
}
