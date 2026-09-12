import { describe, expect, it } from 'vitest'
import { normalizeMobile, smsHref, whatsappHref } from './invite-link'

describe('normalizeMobile', () => {
  it.each([
    // The three shapes a Korčula roster actually contains.
    ['+385 91 234 5678', '385912345678'],
    ['091 234 5678', '385912345678'],
    ['0912345678', '385912345678'],
    ['00385 91 234 5678', '385912345678'],
    ['385912345678', '385912345678'],
    ['+385-91-234-5678', '385912345678'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeMobile(raw)).toBe(expected)
  })

  it.each([
    ['', null],
    ['   ', null],
    ['nema', null],
    // Too short to be a number with a country code, and too long for E.164.
    ['091 22', null],
    ['+385912345678901234', null],
    [null, null],
    [undefined, null],
  ])('%s → null', (raw, expected) => {
    expect(normalizeMobile(raw)).toBe(expected)
  })
})

describe('smsHref', () => {
  // The one thing the platforms disagree on, and each ignores the other's
  // separator silently: get it wrong and the composer opens empty.
  it('separates the body with & on iOS and ? everywhere else', () => {
    expect(smsHref('385912345678', 'Bok', 'ios')).toBe('sms:385912345678&body=Bok')
    expect(smsHref('385912345678', 'Bok', 'android')).toBe('sms:385912345678?body=Bok')
    expect(smsHref('385912345678', 'Bok', 'other')).toBe('sms:385912345678?body=Bok')
  })

  it('opens an empty composer when the number is unreadable', () => {
    expect(smsHref(null, 'Bok', 'ios')).toBe('sms:&body=Bok')
  })

  it('escapes the message, link and all', () => {
    const href = smsHref('385912345678', 'Link: https://moreska.eu/app/prijava?token=a b', 'ios')
    expect(href).toContain('body=Link%3A%20https%3A%2F%2Fmoreska.eu%2Fapp%2Fprijava%3Ftoken%3Da%20b')
  })
})

describe('whatsappHref', () => {
  it('targets the number when there is one', () => {
    expect(whatsappHref('385912345678', 'Bok')).toBe('https://wa.me/385912345678?text=Bok')
  })

  it('falls back to the chooser', () => {
    expect(whatsappHref(null, 'Bok')).toBe('https://wa.me/?text=Bok')
  })
})
