// The single seam behind both public enquiry forms (Contact + ServiceEnquiryForm).
//
// Before #220 these forms rendered a fake success and dropped every submission
// on the floor. This seam makes persistence the source of truth: a submission
// is only "ok" once it is stored in ContactSubmissions. The admin notification
// email is strictly best-effort — Brevo being down or mis-keyed (a real risk on
// this project) must never turn a successfully-stored enquiry into a failure.
//
// Pure + DI so the route/server-action adapter stays a thin wiring layer and the
// validation + persist-vs-notify ordering is unit-testable without Payload/Brevo.

import { toEnquiryType, type EnquiryType } from './enquiry-type'

export interface EnquiryInput {
  name: string
  email: string
  message: string
  // Raw enquiry value from the form: a localized contact-form label or a service
  // slug. Mapped to the stored enum via toEnquiryType.
  enquiry?: string
}

export interface PersistedEnquiry {
  name: string
  email: string
  message: string
  enquiryType: EnquiryType
}

export interface SubmitEnquiryDeps {
  // Stores the enquiry. Must reject on failure so the caller sees an error.
  persist: (data: PersistedEnquiry) => Promise<void>
  // Best-effort admin notification. Its rejection is swallowed (logged) — a
  // stored enquiry is already safe; a missed email is not data loss.
  notify?: (data: PersistedEnquiry) => Promise<void>
  // Best-effort critical-events sink (#235, ADR-0016). Records the previously-
  // silent "enquiry saved but nobody was notified" cases: a notify that throws
  // (Brevo down / mis-keyed) OR no notifier wired at all (the adapter omits it
  // when BREVO_API_KEY is missing). Must never throw; a record failure must not
  // turn a stored enquiry into a failure.
  recordEvent?: (event: { kind: string; context?: Record<string, unknown> }) => Promise<void>
}

export type SubmitEnquiryResult = { ok: true } | { ok: false; error: string }

// Deliberately liberal: just enough to reject obvious junk / empty submits
// without rejecting a real address. Real delivery is validated by the reply.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function submitEnquiry(
  input: EnquiryInput,
  deps: SubmitEnquiryDeps,
): Promise<SubmitEnquiryResult> {
  const name = (input.name ?? '').trim()
  const email = (input.email ?? '').trim()
  const message = (input.message ?? '').trim()

  if (!name) return { ok: false, error: 'Name is required' }
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'A valid email is required' }
  if (!message) return { ok: false, error: 'Message is required' }

  const data: PersistedEnquiry = {
    name,
    // Store lowercased so admin search / future de-dupe is stable.
    email: email.toLowerCase(),
    message,
    enquiryType: toEnquiryType(input.enquiry),
  }

  // Persistence first and required: this is what closes #220.
  try {
    await deps.persist(data)
  } catch (err) {
    console.error('[submitEnquiry] persist failed', err)
    return { ok: false, error: 'Could not save your message. Please try again.' }
  }

  // Notification is best-effort — never fail a stored enquiry on a mail error.
  // Both the "send failed" and the "no notifier wired" paths used to be silent;
  // each now records a critical event (#235) so a superadmin can see that an
  // enquiry was stored but the org was never emailed.
  if (deps.notify) {
    try {
      await deps.notify(data)
    } catch (err) {
      console.error('[submitEnquiry] notify failed (enquiry was saved)', err)
      await recordSafely(deps.recordEvent, {
        kind: 'enquiry_notification_failed',
        context: {
          email: data.email,
          enquiryType: data.enquiryType,
          error: err instanceof Error ? err.message : String(err),
        },
      })
    }
  } else {
    // No notifier wired: on this project the adapter omits it exactly when
    // BREVO_API_KEY is missing, so the enquiry email silently won't deliver.
    await recordSafely(deps.recordEvent, {
      kind: 'enquiry_notification_skipped',
      context: {
        email: data.email,
        enquiryType: data.enquiryType,
        reason: 'no notifier configured (likely missing BREVO_API_KEY)',
      },
    })
  }

  return { ok: true }
}

// Calls the best-effort recorder, guaranteeing it can never surface as a failure
// of the (already successful) enquiry submission.
async function recordSafely(
  recordEvent: SubmitEnquiryDeps['recordEvent'],
  event: { kind: string; context?: Record<string, unknown> },
): Promise<void> {
  if (!recordEvent) return
  try {
    await recordEvent(event)
  } catch (err) {
    console.error('[submitEnquiry] recordEvent failed (enquiry was saved)', err)
  }
}
