import { describe, expect, it } from 'vitest'
import { toPerformanceFacts } from '@/lib/app/performance-facts'
import { calendarFeedUrl, decideCalendarFeed, tokenFromSegment } from './feed'

// #433 — the gate and the URL the `/app` panel shows.

describe('decideCalendarFeed', () => {
  it('serves the feed for the configured token, with or without the suffix', () => {
    expect(decideCalendarFeed('s3cret.ics', 's3cret')).toBe('serve')
    expect(decideCalendarFeed('s3cret', 's3cret')).toBe('serve')
  })

  it('does not exist for any other token', () => {
    expect(decideCalendarFeed('s3crea.ics', 's3cret')).toBe('unknown-token')
    expect(decideCalendarFeed('.ics', 's3cret')).toBe('unknown-token')
    // A longer guess must not throw: timingSafeEqual rejects unequal buffers.
    expect(decideCalendarFeed(`${'x'.repeat(200)}.ics`, 's3cret')).toBe('unknown-token')
  })

  it('says so when the deployment has no token at all', () => {
    expect(decideCalendarFeed('anything.ics', undefined)).toBe('not-configured')
    expect(decideCalendarFeed('anything.ics', '   ')).toBe('not-configured')
  })
})

describe('tokenFromSegment', () => {
  it('strips only a trailing .ics', () => {
    expect(tokenFromSegment('abc.ics')).toBe('abc')
    expect(tokenFromSegment('abc.icsx')).toBe('abc.icsx')
    expect(tokenFromSegment('abc')).toBe('abc')
  })
})

describe('calendarFeedUrl', () => {
  it('joins the base URL and the token into the link a dancer copies', () => {
    expect(calendarFeedUrl('https://moreska.eu', 's3cret')).toBe(
      'https://moreska.eu/api/app/calendar/s3cret.ics',
    )
  })

  it('tolerates a trailing slash on the base URL', () => {
    expect(calendarFeedUrl('https://moreska.eu/', 's3cret')).toBe(
      'https://moreska.eu/api/app/calendar/s3cret.ics',
    )
  })

  it('is null when either half is missing, so no panel is rendered', () => {
    expect(calendarFeedUrl(undefined, 's3cret')).toBeNull()
    expect(calendarFeedUrl('https://moreska.eu', null)).toBeNull()
  })
})

describe('toPerformanceFacts, as the feed reads it', () => {
  it('projects a Payload doc, updatedAt included', () => {
    expect(
      toPerformanceFacts({
        id: 7,
        date: '2026-08-05T00:00:00.000Z',
        time: '21:00',
        kind: 'redovna',
        isPublic: true,
        venue: 'ljetno-kino',
        status: 'active',
        voditeljNote: 'na molu',
        updatedAt: '2026-07-01T10:00:00.000Z',
      }),
    ).toEqual({
      id: '7',
      date: '2026-08-05',
      time: '21:00',
      kind: 'redovna',
      isPublic: true,
      venue: 'ljetno-kino',
      location: null,
      cancelled: false,
      voditeljNote: 'na molu',
      updatedAt: '2026-07-01T10:00:00.000Z',
    })
  })
})
