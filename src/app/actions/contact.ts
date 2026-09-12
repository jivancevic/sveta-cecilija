'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { submitEnquiry, type EnquiryInput, type SubmitEnquiryResult } from '@/lib/contact/submit-enquiry'
import { sendEnquiryNotification } from '@/lib/email/send-enquiry-notification'
import { sendEnquiryAcknowledgement } from '@/lib/email/send-enquiry-acknowledgement'
import { notifyStaffOfEnquiry } from '@/lib/app/staff-notifications'
import { getLocale } from '@/lib/locale'
import { recordCriticalEvent } from '@/lib/critical-events/record'
import type { PoolQuery } from '@/lib/tickets/sold-seats'

// Thin adapter: wires the Payload local API (persist), the Brevo seam (the org
// notification + the enquirer acknowledgement, #236), and the critical-events
// sink (recordEvent, #235) into the pure submitEnquiry core. Both public enquiry
// forms call this. Returns a plain serializable result the client uses to drive
// its success/error state.
export async function submitContactEnquiry(input: EnquiryInput): Promise<SubmitEnquiryResult> {
  const payload = await getPayload({ config })
  const brevoApiKey = process.env.BREVO_API_KEY ?? ''
  // Enquirer's site language (cookie-based, forwarded via x-locale by the proxy)
  // so the acknowledgement matches the page they wrote from.
  const locale = await getLocale()
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool

  return submitEnquiry(input, {
    persist: async (data) => {
      await payload.create({ collection: 'contact-submissions', data })
      // The inbox row is written in the SAME call that stores the enquiry
      // (#496), so "a new inquiry arrived" is a fact of the submission rather
      // than of the mail going out — Brevo being down leaves `notify` unwired,
      // and the secretary would otherwise learn nothing. It never throws (see
      // `staff-notifications.ts`), so a stored enquiry stays stored.
      await notifyStaffOfEnquiry(pool.query, {
        name: data.name,
        enquiryType: data.enquiryType,
      })
    },
    notify: brevoApiKey
      ? async (data) => {
          await sendEnquiryNotification(data, { fetch, brevoApiKey })
        }
      : undefined,
    acknowledge: brevoApiKey
      ? async (data) => {
          await sendEnquiryAcknowledgement(
            { name: data.name, email: data.email, locale },
            { fetch, brevoApiKey },
          )
        }
      : undefined,
    // Best-effort: makes the previously-silent "saved but org not emailed" cases
    // visible on the superadmin dev strip (#235).
    recordEvent: (event) =>
      recordCriticalEvent(event, { query: (sql, params) => pool.query(sql, params) }),
  })
}
