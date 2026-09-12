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
  // The show day is a calendar day in KORČULA, never an instant and never the
  // server's date: the container runs UTC. Every instant below is written in
  // UTC (the `Z`) so the test says the same thing wherever it runs.
  const utc = (iso: string) => new Date(iso)

  it('is true through the Zagreb day, from morning to just before midnight', () => {
    expect(isDoorShowToday('2026-08-14', utc('2026-08-14T08:00:00Z'))).toBe(true)
    // 23:30 Zagreb, which is 21:30 UTC in summer.
    expect(isDoorShowToday('2026-08-14', utc('2026-08-14T21:30:00Z'))).toBe(true)
  })

  it('is false for tomorrow and for yesterday', () => {
    expect(isDoorShowToday('2026-08-15', utc('2026-08-14T19:00:00Z'))).toBe(false)
    expect(isDoorShowToday('2026-08-13', utc('2026-08-14T10:00:00Z'))).toBe(false)
  })

  it('reads 00:30 Zagreb as the new day, not as the server’s yesterday', () => {
    // 00:30 on the 15th in Zagreb is 22:30 on the 14th in UTC. A server-local
    // comparison answers "the 14th" here, which would put the strip on the
    // night AFTER the izvedba and hide it on the morning of the next one.
    const justAfterMidnightZagreb = utc('2026-08-14T22:30:00Z')
    expect(isDoorShowToday('2026-08-15', justAfterMidnightZagreb)).toBe(true)
    expect(isDoorShowToday('2026-08-14', justAfterMidnightZagreb)).toBe(false)
  })

  it('holds in winter too, when Zagreb is UTC+1', () => {
    // 00:30 on 2 November Zagreb = 23:30 on 1 November UTC.
    expect(isDoorShowToday('2026-11-02', utc('2026-11-01T23:30:00Z'))).toBe(true)
  })

  it('is false with no active door show at all', () => {
    expect(isDoorShowToday(null, utc('2026-08-14T08:00:00Z'))).toBe(false)
  })
})

describe('partyBreakdown', () => {
  // The result card stays English: a guest reads it over the volunteer's
  // shoulder (#476). The separator is a middle dot, because the no-em-dash rule
  // covers every line a person reads, English ones included.
  it('names one ticket in the singular', () => {
    expect(partyBreakdown(1, 0)).toBe('1 ticket · 1 adult')
  })

  it('names adults and children when the party has both', () => {
    expect(partyBreakdown(2, 1)).toBe('3 tickets · 2 adults, 1 child')
    expect(partyBreakdown(1, 3)).toBe('4 tickets · 1 adult, 3 children')
  })

  it('names only the half that exists', () => {
    expect(partyBreakdown(0, 2)).toBe('2 tickets · 2 children')
    expect(partyBreakdown(4, 0)).toBe('4 tickets · 4 adults')
  })

  it('carries no em dash, whatever the party', () => {
    for (const [a, c] of [[1, 0], [0, 1], [2, 3], [7, 0]] as const) {
      expect(partyBreakdown(a, c)).not.toContain('\u2014')
    }
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
