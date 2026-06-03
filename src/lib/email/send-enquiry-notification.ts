// Transactional sender for the internal "new public enquiry" notification (#220).
// Fires through the single Brevo seam (postBrevoEmail) like every other mail
// path. Sends from the verified transactional sender (tickets@moreska.eu) to the
// org inbox (info@moreska.eu), with Reply-To set to the enquirer so staff can
// reply straight from their inbox. Best-effort: the caller (submitEnquiry) treats
// any throw as non-fatal because the enquiry is already persisted.
import { postBrevoEmail } from './post-brevo-email'

export interface EnquiryNotificationInput {
  name: string
  email: string
  message: string
  enquiryType: string
}

export interface SendEnquiryNotificationDeps {
  fetch: typeof fetch
  brevoApiKey: string
}

// Internal mail → org inbox. Reply-To is the enquirer (set per-send below).
const SENDER = { email: 'tickets@moreska.eu', name: 'Moreška website' }
const TO = { email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' }

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendEnquiryNotification(
  input: EnquiryNotificationInput,
  deps: SendEnquiryNotificationDeps,
): Promise<void> {
  const subject = `New enquiry (${input.enquiryType}) from ${input.name}`
  const html = `
<div style="font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;color:#1a1a1a;font-size:15px;line-height:1.55;">
  <p style="margin:0 0 12px 0;"><strong>New website enquiry</strong></p>
  <table cellpadding="0" cellspacing="0" border="0" style="font-size:14px;">
    <tr><td style="padding:2px 12px 2px 0;color:#777;">Name</td><td>${esc(input.name)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#777;">Email</td><td><a href="mailto:${esc(input.email)}">${esc(input.email)}</a></td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#777;">Type</td><td>${esc(input.enquiryType)}</td></tr>
  </table>
  <p style="margin:16px 0 4px 0;color:#777;font-size:14px;">Message</p>
  <p style="margin:0;white-space:pre-wrap;">${esc(input.message)}</p>
</div>`.trim()

  const res = await postBrevoEmail(
    {
      sender: SENDER,
      to: [TO],
      replyTo: { email: input.email, name: input.name },
      subject,
      htmlContent: html,
    },
    { fetch: deps.fetch, brevoApiKey: deps.brevoApiKey },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Brevo enquiry notification failed status=${res.status} body=${text}`)
  }
}
