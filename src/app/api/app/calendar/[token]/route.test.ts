import { describe, it, expect, beforeEach, vi } from 'vitest'

// #441 review — the calendar route's own gate, the cron route's test shape: the
// data loader is mocked, so what is exercised here is exactly what the ROUTE
// decides — the token, the missing env var, the headers, and the fact that the
// `.ics` a calendar client appends is part of the segment.

const getCalendarPerformances = vi.fn(async () => [])

vi.mock('@/lib/calendar/calendar-data', () => ({
  getCalendarPerformances: () => getCalendarPerformances(),
}))

import { GET } from './route'

const call = (token: string) =>
  GET(new Request(`http://localhost/api/app/calendar/${token}`), {
    params: Promise.resolve({ token }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CALENDAR_FEED_TOKEN = 's3cret'
})

describe('GET /api/app/calendar/[token].ics', () => {
  it('serves the feed for the configured token', async () => {
    const res = await call('s3cret.ics')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600')
    expect(await res.text()).toContain('BEGIN:VCALENDAR')
    expect(getCalendarPerformances).toHaveBeenCalledTimes(1)
  })

  it('accepts the token with or without the .ics a client appends', async () => {
    expect((await call('s3cret')).status).toBe(200)
  })

  it('does not exist for a wrong token, and reads nothing', async () => {
    const res = await call('guess.ics')
    expect(res.status).toBe(404)
    expect(getCalendarPerformances).not.toHaveBeenCalled()
  })

  it('500s loudly when the deployment has no token', async () => {
    delete process.env.CALENDAR_FEED_TOKEN
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await call('anything.ics')

    expect(res.status).toBe(500)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('CALENDAR_FEED_TOKEN'))
    expect(getCalendarPerformances).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
