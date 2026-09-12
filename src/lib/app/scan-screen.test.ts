import { describe, expect, it } from 'vitest'
import {
  extractScanToken,
  isDoorShowToday,
  partyBreakdown,
  remainingAfterAdmit,
  resultChrome,
  SCAN_RESULT_STATES,
} from './scan-screen'

// The pure half of Skener (#504). Four rules, each of which was inline and
// untested in `/admin/scan` before the port: what a decoded QR means, whether
// the active door show is tonight, what the English result card says, and how
// many of a party are still outside.

describe('extractScanToken', () => {
  it('takes the token out of a full scan URL', () => {
    expect(extractScanToken('https://moreska.eu/scan/abc123def')).toBe('abc123def')
  })

  it('accepts a trailing slash, a query string and a fragment', () => {
    expect(extractScanToken('https://moreska.eu/scan/abc123def/')).toBe('abc123def')
    expect(extractScanToken('https://moreska.eu/scan/abc123def?x=1')).toBe('abc123def')
    expect(extractScanToken('https://moreska.eu/scan/abc123def#y')).toBe('abc123def')
  })

  it('accepts a bare path and a bare token', () => {
    expect(extractScanToken('/scan/abc123def')).toBe('abc123def')
    expect(extractScanToken('scan/abc123def')).toBe('abc123def')
    expect(extractScanToken('abc123def')).toBe('abc123def')
  })

  it('trims surrounding whitespace a decoder may hand over', () => {
    expect(extractScanToken('  https://moreska.eu/scan/abc123def  ')).toBe('abc123def')
  })

  it('refuses anything that is not a scan target', () => {
    expect(extractScanToken('')).toBeNull()
    expect(extractScanToken('   ')).toBeNull()
    expect(extractScanToken('https://moreska.eu/tickets')).toBeNull()
    expect(extractScanToken('https://moreska.eu/scan/a/b')).toBeNull()
    // Too short to be a token, so a stray barcode does not become a POST.
    expect(extractScanToken('abc')).toBeNull()
    expect(extractScanToken('hello world')).toBeNull()
  })
})

describe('isDoorShowToday', () => {
  // Korčula is UTC+2 in season; the show day is a calendar day, not an instant,
  // so the comparison is on the local date of `now`.
  const at = (iso: string) => new Date(iso)

  it('is true when the show is on the same calendar day as now', () => {
    expect(isDoorShowToday('2026-08-14', at('2026-08-14T10:00:00'))).toBe(true)
    expect(isDoorShowToday('2026-08-14', at('2026-08-14T23:30:00'))).toBe(true)
  })

  it('is false for tomorrow and for yesterday', () => {
    expect(isDoorShowToday('2026-08-15', at('2026-08-14T21:00:00'))).toBe(false)
    expect(isDoorShowToday('2026-08-13', at('2026-08-14T00:10:00'))).toBe(false)
  })

  it('is false with no active door show at all', () => {
    expect(isDoorShowToday(null, at('2026-08-14T10:00:00'))).toBe(false)
  })
})

describe('partyBreakdown', () => {
  // The result card stays English: a guest reads it over the volunteer's
  // shoulder (#476).
  it('names one ticket in the singular', () => {
    expect(partyBreakdown(1, 0)).toBe('1 ticket — 1 adult')
  })

  it('names adults and children when the party has both', () => {
    expect(partyBreakdown(2, 1)).toBe('3 tickets — 2 adults, 1 child')
    expect(partyBreakdown(1, 3)).toBe('4 tickets — 1 adult, 3 children')
  })

  it('names only the half that exists', () => {
    expect(partyBreakdown(0, 2)).toBe('2 tickets — 2 children')
    expect(partyBreakdown(4, 0)).toBe('4 tickets — 4 adults')
  })
})

describe('resultChrome', () => {
  it('covers all four result states', () => {
    expect(SCAN_RESULT_STATES).toEqual(['VALID', 'ALREADY_SCANNED', 'CANCELLED', 'INVALID'])
    for (const status of SCAN_RESULT_STATES) {
      const chrome = resultChrome(status)
      expect(chrome.heading.length).toBeGreaterThan(0)
      expect(chrome.variant).toBe(status.toLowerCase().replace(/_/g, '-'))
    }
  })

  it('keeps the heading English and upper-case', () => {
    expect(resultChrome('VALID').heading).toBe('VALID')
    expect(resultChrome('ALREADY_SCANNED').heading).toBe('ALREADY SCANNED')
    expect(resultChrome('CANCELLED').heading).toBe('CANCELLED')
    expect(resultChrome('INVALID').heading).toBe('INVALID')
  })

  it('falls back to INVALID for a status it does not know', () => {
    expect(resultChrome('BUYER_VIEW').heading).toBe('INVALID')
  })
})

describe('remainingAfterAdmit', () => {
  it('counts the party members still outside after this one walks in', () => {
    expect(remainingAfterAdmit(4, 0)).toBe(3)
    expect(remainingAfterAdmit(4, 2)).toBe(1)
  })

  it('never goes negative when everyone is already in', () => {
    expect(remainingAfterAdmit(2, 2)).toBe(0)
    expect(remainingAfterAdmit(1, 5)).toBe(0)
  })
})
