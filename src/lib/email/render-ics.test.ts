import { describe, expect, it } from 'vitest'

import { googleCalendarLink, renderIcs, type RenderIcsInput } from './render-ics'

function makeInput(overrides: Partial<RenderIcsInput> = {}): RenderIcsInput {
  return {
    orderId: '1164',
    show: { date: '2026-09-14', time: '21:00', venue: 'ljetno-kino' },
    locale: 'en',
    ...overrides,
  }
}

// The .ics is unfolded before matching: RFC 5545 breaks a long DESCRIPTION
// across lines with CRLF + space, so a plain `toContain` on the raw output
// would fail on exactly the sentence this test exists for.
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, '')
}

describe('renderIcs entrance note (#674)', () => {
  it('carries the entrance time in the description, in both languages', () => {
    expect(unfold(renderIcs(makeInput()))).toContain('Entrance opens around 20:30.')
    expect(unfold(renderIcs(makeInput({ locale: 'hr' })))).toContain('Ulaz se otvara oko 20:30.')
  })

  it('leaves the event starting at the performance, not at the entrance', () => {
    // 21:00 Korčula (CEST) = 19:00 UTC.
    expect(renderIcs(makeInput())).toContain('DTSTART:20260914T190000Z')
  })

  it('puts the same note in the Google Calendar link', () => {
    // URLSearchParams spells a space as '+', which decodeURIComponent leaves alone.
    const details = decodeURIComponent(googleCalendarLink(makeInput())).replace(/\+/g, ' ')
    expect(details).toContain('Entrance opens around 20:30.')
  })
})
