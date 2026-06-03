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
  // Best-effort acknowledgement to the enquirer (#236): "we received your
  // message". Independently swallowed so it neither blocks the org notification
  // nor fails a stored enquiry. The caller binds the enquirer's locale here.
  acknowledge?: (data: PersistedEnquiry) => Promise<void>
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

  // Both mails below are best-effort — never fail a stored enquiry on a mail
  // error, and one failing must not skip the other.
  if (deps.notify) {
    try {
      await deps.notify(data)
    } catch (err) {
      console.error('[submitEnquiry] notify failed (enquiry was saved)', err)
    }
  }

  if (deps.acknowledge) {
    try {
      await deps.acknowledge(data)
    } catch (err) {
      console.error('[submitEnquiry] acknowledge failed (enquiry was saved)', err)
    }
  }

  return { ok: true }
}
