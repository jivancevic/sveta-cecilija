'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { submitEnquiry, type EnquiryInput, type SubmitEnquiryResult } from '@/lib/contact/submit-enquiry'
import { sendEnquiryNotification } from '@/lib/email/send-enquiry-notification'

// Thin adapter: wires the Payload local API (persist) and the Brevo seam (notify)
// into the pure submitEnquiry core. Both public enquiry forms call this. Returns
// a plain serializable result the client uses to drive its success/error state.
export async function submitContactEnquiry(input: EnquiryInput): Promise<SubmitEnquiryResult> {
  const payload = await getPayload({ config })
  const brevoApiKey = process.env.BREVO_API_KEY ?? ''

  return submitEnquiry(input, {
    persist: async (data) => {
      await payload.create({ collection: 'contact-submissions', data })
    },
    notify: brevoApiKey
      ? async (data) => {
          await sendEnquiryNotification(data, { fetch, brevoApiKey })
        }
      : undefined,
  })
}
