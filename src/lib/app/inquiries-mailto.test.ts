import { describe, expect, it } from 'vitest'
import {
  MAX_QUOTED_MESSAGE,
  quoteMessage,
  replyMailto,
  replySubject,
} from './inquiries-mailto'

/** The body of a built mailto, decoded back into plain text. */
function bodyOf(href: string): string {
  const params = new URLSearchParams(href.slice(href.indexOf('?') + 1))
  return params.get('body') ?? ''
}

function subjectOf(href: string): string {
  const params = new URLSearchParams(href.slice(href.indexOf('?') + 1))
  return params.get('subject') ?? ''
}

describe('replySubject', () => {
  it('names the service a booking enquiry is about', () => {
    expect(replySubject('private-moreska')).toBe('Re: Privatna moreška')
    expect(replySubject('moreska-experience')).toBe('Re: Moreška iskustvo')
  })

  it('says "your enquiry" when there is no service behind it', () => {
    expect(replySubject('general')).toBe('Re: Vaš upit')
    expect(replySubject('other')).toBe('Re: Vaš upit')
  })
})

describe('quoteMessage', () => {
  it('prefixes every line, and keeps a blank line as a bare marker', () => {
    expect(quoteMessage('prvi\n\ndrugi')).toBe('> prvi\r\n>\r\n> drugi')
  })

  it('normalises CRLF and lone CR from the browser textarea', () => {
    expect(quoteMessage('a\r\nb\rc')).toBe('> a\r\n> b\r\n> c')
  })

  it('trims the surrounding whitespace rather than quoting empty lines', () => {
    expect(quoteMessage('\n\n  zdravo  \n\n')).toBe('> zdravo')
  })

  it('cuts a message that would not survive a mailto and says so', () => {
    const long = 'x'.repeat(MAX_QUOTED_MESSAGE + 500)
    const quoted = quoteMessage(long)
    expect(quoted.length).toBeLessThan(long.length)
    expect(quoted.endsWith('\r\n> [...]')).toBe(true)
  })

  it('is empty for an empty message', () => {
    expect(quoteMessage('   ')).toBe('')
  })
})

describe('replyMailto', () => {
  const inquiry = {
    email: 'ana@example.com',
    enquiryType: 'private-moreska' as const,
    message: 'Zanima nas privatna izvedba.\nKoliko stoji?',
  }

  it('addresses the enquirer and carries the subject and the quote', () => {
    const href = replyMailto(inquiry)!
    expect(href.startsWith('mailto:ana@example.com?')).toBe(true)
    expect(subjectOf(href)).toBe('Re: Privatna moreška')
    expect(bodyOf(href)).toBe(
      '\r\n\r\n> Zanima nas privatna izvedba.\r\n> Koliko stoji?',
    )
  })

  it('percent-encodes the CRLF, the quote marker and the spaces', () => {
    const href = replyMailto(inquiry)!
    expect(href).toContain('%0D%0A')
    expect(href).toContain('%3E%20Koliko')
    expect(href).not.toContain(' ')
    expect(href).not.toContain('\n')
  })

  it('never lets a character in the message be read as another parameter', () => {
    const href = replyMailto({ ...inquiry, message: 'a&cc=spy@evil.com&b' })!
    expect(bodyOf(href)).toBe('\r\n\r\n> a&cc=spy@evil.com&b')
    expect(new URLSearchParams(href.slice(href.indexOf('?') + 1)).get('cc')).toBeNull()
  })

  it('still opens a compose window when the message is empty', () => {
    const href = replyMailto({ ...inquiry, message: '' })!
    expect(bodyOf(href)).toBe('')
    expect(subjectOf(href)).toBe('Re: Privatna moreška')
  })

  it('is null when there is no address to reply to', () => {
    expect(replyMailto({ ...inquiry, email: '' })).toBeNull()
    expect(replyMailto({ ...inquiry, email: 'not an address' })).toBeNull()
  })

  it('encodes an address that carries a character a URL would read', () => {
    const href = replyMailto({ ...inquiry, email: 'a+b@example.com' })!
    expect(href.startsWith('mailto:a%2Bb@example.com?')).toBe(true)
  })
})
