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
 * The real cap: how long the finished `mailto:` may be, **encoded**.
 *
 * A `mailto:` is passed through the browser, the OS and the mail client, and
 * the shortest link in that chain gives up somewhere around two kilobytes. What
 * travels is the percent-encoded href, not the message, and the two are not the
 * same length: a Croatian sentence full of š, č and ž spends three characters
 * per letter (`%C5%A1`), so a thousand characters of Croatian is several
 * kilobytes of URL. Counting the message would have let exactly the enquiries
 * this society receives silently fail to open a compose window.
 */
export const MAX_MAILTO_HREF = 1800

/**
 * The most of the message that is ever quoted, in **code points**.
 *
 * A ceiling under the real cap above, so an ASCII message is not quoted
 * endlessly just because it encodes cheaply. `replyMailto` shortens below this
 * whenever the encoded href would not fit.
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
 *
 * `limit` counts **code points, never UTF-16 units**. `String.slice` cuts by
 * unit, so a message ending in an emoji at the boundary would be left holding
 * half a surrogate pair, and `encodeURIComponent` throws `URI malformed` on a
 * lone surrogate: the detail page would have 500'd for that one enquiry, and
 * the public form sets no maximum length on what a stranger may paste.
 */
export function quoteMessage(message: string, limit: number = MAX_QUOTED_MESSAGE): string {
  const text = message.replace(/\r\n?/g, '\n').trim()
  if (text === '') return ''

  const points = Array.from(text)
  const cut = points.length > limit
  const body = cut ? points.slice(0, limit).join('').trimEnd() : text
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
 *
 * The quote is shortened until the **encoded** href fits `MAX_MAILTO_HREF`,
 * because that is the string the browser, the OS and the mail client actually
 * carry. Croatian diacritics cost three characters each once encoded, so a
 * message well under the code-point ceiling can still be an eight-kilobyte URL
 * that opens nothing at all.
 */
export function replyMailto(inquiry: ReplyTarget): string | null {
  const address = (inquiry.email ?? '').trim()
  if (!isPlausibleEmail(address)) return null

  const subject = replySubject(inquiry.enquiryType)
  const message = inquiry.message ?? ''

  const build = (limit: number): string => {
    const quoted = quoteMessage(message, limit)
    const body = quoted === '' ? '' : `\r\n\r\n${quoted}`
    const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    // The address is encoded too, minus the `@` that makes it one: a local part
    // may legally carry a `+` or a `?`, and either would be read as URL syntax.
    return `mailto:${encodeURIComponent(address).replace(/%40/g, '@')}?${params}`
  }

  const whole = build(MAX_QUOTED_MESSAGE)
  if (whole.length <= MAX_MAILTO_HREF) return whole

  // Binary search the longest quote that still fits: a dozen builds, and it
  // lands on the same answer for every message rather than on whatever a fixed
  // "characters per byte" guess would have assumed about the alphabet.
  let fits = 0
  let tooLong = MAX_QUOTED_MESSAGE
  while (fits < tooLong) {
    const mid = Math.ceil((fits + tooLong) / 2)
    if (build(mid).length <= MAX_MAILTO_HREF) fits = mid
    else tooLong = mid - 1
  }
  return build(fits)
}
