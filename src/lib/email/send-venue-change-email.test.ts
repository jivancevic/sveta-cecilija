import { describe, expect, it, vi } from 'vitest'
import { renderVenueChangePreview, sendVenueChangeEmail } from './send-venue-change-email'
import { directionsFor } from './directions'

const input = {
  orderId: '1',
  buyer: { name: 'Ana Anić', email: 'ana@example.com' },
  show: { date: '2026-07-15', time: '21:00' },
}

describe('venue-change e-mail carries the NEW venue directions (#543)', () => {
  for (const locale of ['en', 'hr'] as const) {
    it(`${locale}: prose from a landmark, the walk, the entrance, then the map link`, () => {
      const { html } = renderVenueChangePreview(input, locale)
      const d = directionsFor(locale, 'zimsko-kino')
      const decoded = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      expect(decoded).toContain(d.heading)
      for (const s of d.prose) expect(decoded).toContain(s)
      expect(decoded).toContain(d.walk)
      expect(decoded).toContain(d.entrance)
      expect(html).toContain(`href="${d.mapUrl}"`)
      expect(decoded.indexOf(d.prose[0])).toBeLessThan(html.indexOf(`href="${d.mapUrl}"`))
      // Never the outdoor venue's directions: those are the ones the guest
      // already holds and must not follow.
      expect(html).not.toContain(`href="${directionsFor(locale, 'ljetno-kino').mapUrl}"`)
    })
  }

  it('is still one send per buyer', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
    await expect(sendVenueChangeEmail({ ...input, locale: 'hr' }, { fetch, brevoApiKey: 'k' })).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.htmlContent).toContain(directionsFor('hr', 'zimsko-kino').heading)
  })
})
