// The single Brevo transactional-email transport boundary.
//
// Every outbound mail path (ticket confirmation, refund, review, and any
// future template) must POST through `postBrevoEmail` rather than calling
// `fetch('https://api.brevo.com/v3/smtp/email', …)` directly. That single
// choke point is where the staging email kill switch lives: when
// DEV_EMAIL_OVERRIDE is set (only on dev.moreska.eu — Brevo has one shared
// key), `applyDevEmailOverride` rewrites every recipient to the override
// address and tags the subject, so no staging email can reach a real buyer
// *by construction*. Unset in prod + local → exact no-op. See ADR-0009.

export const BREVO_EMAIL_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

// Brevo's `to` / `cc` / `bcc` are arrays of `{ email, name? }`.
export interface BrevoRecipient {
  email: string
  name?: string
}

// The subset of the Brevo payload the override touches. Senders pass the full
// payload (sender, htmlContent, attachment, …); only these fields are rewritten.
export interface BrevoEmailBody {
  subject: string
  to: BrevoRecipient[]
  cc?: BrevoRecipient[]
  bcc?: BrevoRecipient[]
  [key: string]: unknown
}

const DEV_PREFIX_RE = /^\[DEV → [^\]]*\] /

function collectAddresses(body: BrevoEmailBody): string[] {
  const recipients = [...(body.to ?? []), ...(body.cc ?? []), ...(body.bcc ?? [])]
  // De-dupe while preserving order so the subject tag is stable + compact.
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of recipients) {
    if (r?.email && !seen.has(r.email)) {
      seen.add(r.email)
      out.push(r.email)
    }
  }
  return out
}

/**
 * Pure rewrite of a Brevo payload for the staging email kill switch.
 *
 * - `override` falsy (unset / empty) → returned object is byte-for-byte the
 *   input (no-op; prod + local behaviour unchanged).
 * - `override` set → every `to` recipient is replaced with the override
 *   address (keeping each recipient's display name), `cc`/`bcc` are dropped
 *   entirely (nothing must leak), and the subject is prefixed with
 *   `[DEV → original@addr, …] `. Idempotent: an already-tagged subject is not
 *   double-prefixed.
 */
export function applyDevEmailOverride(
  body: BrevoEmailBody,
  override?: string | null,
): BrevoEmailBody {
  const target = override?.trim()
  if (!target) return body

  const originals = collectAddresses(body)
  const tag = `[DEV → ${originals.join(', ')}] `
  const subject = DEV_PREFIX_RE.test(body.subject) ? body.subject : tag + body.subject

  const rewritten: BrevoEmailBody = {
    ...body,
    subject,
    to: (body.to ?? []).map((r) => ({ ...r, email: target })),
  }
  // Drop cc/bcc so no copy reaches a real address.
  delete rewritten.cc
  delete rewritten.bcc
  return rewritten
}

export interface PostBrevoEmailDeps {
  fetch: typeof fetch
  brevoApiKey: string
  // Defaults to process.env.DEV_EMAIL_OVERRIDE; injectable for tests.
  devEmailOverride?: string | null
}

/**
 * POST a transactional email to Brevo, applying the DEV_EMAIL_OVERRIDE rewrite
 * first. This is the only place that should hit the Brevo HTTP endpoint.
 * Returns the raw Response so callers keep their existing error logging.
 */
export async function postBrevoEmail(
  body: BrevoEmailBody,
  deps: PostBrevoEmailDeps,
): Promise<Response> {
  const override =
    deps.devEmailOverride !== undefined ? deps.devEmailOverride : process.env.DEV_EMAIL_OVERRIDE
  const finalBody = applyDevEmailOverride(body, override)

  return deps.fetch(BREVO_EMAIL_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': deps.brevoApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(finalBody),
  })
}
