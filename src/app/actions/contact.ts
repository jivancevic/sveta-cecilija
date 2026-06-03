'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { submitEnquiry, type EnquiryInput, type SubmitEnquiryResult } from '@/lib/contact/submit-enquiry'
import { sendEnquiryNotification } from '@/lib/email/send-enquiry-notification'
import { recordCriticalEvent } from '@/lib/critical-events/record'
import type { PoolQuery } from '@/lib/tickets/sold-seats'

// Thin adapter: wires the Payload local API (persist), the Brevo seam (notify),
// and the critical-events sink (recordEvent) into the pure submitEnquiry core.
// Both public enquiry forms call this. Returns a plain serializable result the
// client uses to drive its success/error state.
export async function submitContactEnquiry(input: EnquiryInput): Promise<SubmitEnquiryResult> {
  const payload = await getPayload({ config })
  const brevoApiKey = process.env.BREVO_API_KEY ?? ''
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool

  return submitEnquiry(input, {
    persist: async (data) => {
      await payload.create({ collection: 'contact-submissions', data })
    },
    notify: brevoApiKey
      ? async (data) => {
          await sendEnquiryNotification(data, { fetch, brevoApiKey })
        }
      : undefined,
    // Best-effort: makes the previously-silent "saved but not emailed" cases
    // visible on the superadmin dev strip (#235).
    recordEvent: (event) =>
      recordCriticalEvent(event, { query: (sql, params) => pool.query(sql, params) }),
  })
}
