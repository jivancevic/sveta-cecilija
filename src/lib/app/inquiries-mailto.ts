// **Odgovori** — the reply, as a `mailto:` (#507).
//
// Cecilija does not send this mail and will not: Tatjana answers from
// `info@moreska.eu` in Gmail, where the thread, the signature and the sent copy
// already live. A reply written in the app would land in a second outbox nobody
// reads, and an enquirer answering it would reply to a mailbox the app cannot
// show. So the screen's job is to open her compose window with the address, a
// subject and the enquiry quoted under the cursor, and then get out of the way.
//
// Everything here is pure and every part of it is encoded, because a `mailto:`
// is a URL built out of text a stranger typed into a public form. An unescaped
// `&` in a message would otherwise become a second parameter, and `cc=` is a
// parameter mail clients honour.

import { isPlausibleEmail } from '@/lib/claim/claim-order'
import type { EnquiryType } from '@/lib/contact/enquiry-type'
import { APP_STRINGS } from './strings'

const S = APP_STRINGS.inquiries

/**
 * How much of the message rides along in the URL.
 *
 * A `mailto:` is passed through the browser, the OS and the mail client, and
 * the shortest link in that chain gives up somewhere around two kilobytes. The
 * cut is generous for the enquiries this form receives and short enough that
 * the compose window opens rather than silently doing nothing; the whole
 * message stays readable on the screen the button sits on.
 */
export const MAX_QUOTED_MESSAGE = 1200

/** What the quote block ends with when the message did not fit. */
const ELLIPSIS = '> [...]'

/**
 * The subject of the reply.
 *
 * The form stores no subject line, so the enquiry's own type is the subject: a
 * booking enquiry is answered under the name of the service it asked about, and
 * a general one under "Vaš upit". Croatian, like the rest of the app, and
 * editable in the compose window before anything is sent.
 */
export function replySubject(enquiryType: EnquiryType): string {
  return `Re: ${S.replySubjects[enquiryType] ?? S.replySubjects.general}`
}

/**
 * The enquiry as a quote block: `> ` before every line, CRLF between them.
 *
 * CRLF because that is what SMTP and every mail client expect; a lone `\n`
 * survives most of the chain and then folds a quote into one paragraph in the
 * one client that does not. A blank line keeps its marker (`>`) rather than its
 * trailing space, which is how every mail client quotes one.
 */
export function quoteMessage(message: string, limit: number = MAX_QUOTED_MESSAGE): string {
  const text = message.replace(/\r\n?/g, '\n').trim()
  if (text === '') return ''

  const cut = text.length > limit
  const body = cut ? text.slice(0, limit).trimEnd() : text
  const lines = body.split('\n').map((line) => {
    const trimmed = line.trimEnd()
    return trimmed === '' ? '>' : `> ${trimmed}`
  })
  if (cut) lines.push(ELLIPSIS)
  return lines.join('\r\n')
}

export interface ReplyTarget {
  email: string | null | undefined
  enquiryType: EnquiryType
  message: string | null | undefined
}

/**
 * The whole `mailto:`, or null when the enquiry carries no usable address.
 *
 * Null is a real answer rather than a broken link: the public form requires an
 * address, but a row imported or edited by hand may not have one, and a button
 * that opens an empty compose window is worse than a sentence saying there is
 * nobody to write to.
 *
 * The body opens with two blank lines so the cursor lands above the quote,
 * which is where a reply is written.
 */
export function replyMailto(inquiry: ReplyTarget): string | null {
  const address = (inquiry.email ?? '').trim()
  if (!isPlausibleEmail(address)) return null

  const subject = replySubject(inquiry.enquiryType)
  const quoted = quoteMessage(inquiry.message ?? '')
  const body = quoted === '' ? '' : `\r\n\r\n${quoted}`

  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  // The address is encoded too, minus the `@` that makes it one: a local part
  // may legally carry a `+` or a `?`, and either would be read as URL syntax.
  return `mailto:${encodeURIComponent(address).replace(/%40/g, '@')}?${params}`
}
