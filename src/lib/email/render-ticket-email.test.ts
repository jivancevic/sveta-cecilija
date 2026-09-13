import { describe, it, expect } from 'vitest'
import { __test__, renderTicketEmail, type RenderTicketEmailInput } from './render-ticket-email'
import { directionsFor } from './directions'
import { eveningFacts } from '../evening'
import { programmeUrl } from '../site-url'
import en from '../../messages/en.json'
import hr from '../../messages/hr.json'

function makeInput(overrides: Partial<RenderTicketEmailInput> = {}): RenderTicketEmailInput {
  return {
    buyer: { name: 'Ana Anić' },
    show: { date: '2026-07-15', time: '21:00', venue: 'ljetno-kino' },
    order: { adultCount: 2, childCount: 1, total: 5000 },
    locale: 'en',
    orderRef: 'AB23',
    ...overrides,
  }
}

// react-email escapes quotes and apostrophes as entities; compare on the
// decoded text so a sentence with an apostrophe still matches verbatim.
function decode(html: string): string {
  return html
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

describe('renderTicketEmail footer', () => {
  it('offers the mailbox, the response time and the order-number hint in English', async () => {
    const { html } = await renderTicketEmail(makeInput())

    expect(html).toContain('mailto:info@moreska.eu')
    expect(html).toContain('We reply within 24 hours.')
    expect(html).toContain('Please include your order number')
  })

  it('offers the mailbox, the response time and the order-number hint in Croatian', async () => {
    const { html } = await renderTicketEmail(makeInput({ locale: 'hr' }))

    expect(html).toContain('mailto:info@moreska.eu')
    expect(html).toContain('Odgovaramo u roku od 24 sata.')
    expect(html).toContain('Molimo navedite broj narud')
  })

  it('never offers a phone number: support is email only (#546)', async () => {
    for (const locale of ['en', 'hr'] as const) {
      const { html } = await renderTicketEmail(makeInput({ locale }))
      expect(html).not.toContain('+385')
      expect(html).not.toContain('tel:')
    }
  })

  it('labels the registered office so it cannot be read as the venue (#543)', async () => {
    const { html: enHtml } = await renderTicketEmail(makeInput())
    expect(enHtml).toContain('Registered office (not the venue): Knežev prolaz 1')
    const { html: hrHtml } = await renderTicketEmail(makeInput({ locale: 'hr' }))
    expect(hrHtml).toContain('Sjedište društva (nije mjesto izvedbe): Knežev prolaz 1')
  })
})

describe('renderTicketEmail: what to expect, how to find us, the programme (#543)', () => {
  for (const locale of ['en', 'hr'] as const) {
    const messages = locale === 'en' ? en : hr

    it(`${locale}: repeats the three evening facts in the site's own words and order`, async () => {
      const { html } = await renderTicketEmail(makeInput({ locale }))
      const text = decode(html)
      const facts = eveningFacts(messages.evening)
      expect(facts).toHaveLength(3)
      for (const fact of facts) expect(text).toContain(fact)
      expect(text).toContain(messages.evening.label)
      // In order: runtime before parts before seating.
      expect(text.indexOf(facts[0])).toBeLessThan(text.indexOf(facts[1]))
      expect(text.indexOf(facts[1])).toBeLessThan(text.indexOf(facts[2]))
    })

    it(`${locale}: carries the front-row note in the programme page's own words`, async () => {
      const { html } = await renderTicketEmail(makeInput({ locale }))
      expect(decode(html)).toContain(messages.programmePage.frontRow)
    })

    it(`${locale}: links the programme as a plain link built from the site URL`, async () => {
      const { html } = await renderTicketEmail(makeInput({ locale }))
      expect(html).toContain(`href="${programmeUrl()}"`)
      // A link, never an image: nothing here may exist only inside an image.
      expect(html).not.toMatch(/<img/i)
    })

    it(`${locale}: gives the Summer Cinema directions for a ljetno-kino show, with its map link`, async () => {
      const { html } = await renderTicketEmail(makeInput({ locale, show: { date: '2026-07-15', time: '21:00', venue: 'ljetno-kino' } }))
      const text = decode(html)
      const d = directionsFor(locale, 'ljetno-kino')
      expect(text).toContain(d.heading)
      for (const s of d.prose) expect(text).toContain(s)
      expect(text).toContain(d.walk)
      expect(text).toContain(d.entrance)
      expect(html).toContain(`href="${d.mapUrl}"`)
      expect(d.mapUrl).toBe(messages.performancesPage.venuePrimaryMapUrl)
      // And not the other venue's.
      const other = directionsFor(locale, 'zimsko-kino')
      expect(html).not.toContain(`href="${other.mapUrl}"`)
      expect(text).not.toContain(other.prose[0])
    })

    it(`${locale}: gives the Cultural Center directions for a zimsko-kino show, with its map link`, async () => {
      const { html } = await renderTicketEmail(makeInput({ locale, show: { date: '2026-11-02', time: '20:00', venue: 'zimsko-kino' } }))
      const text = decode(html)
      const d = directionsFor(locale, 'zimsko-kino')
      for (const s of d.prose) expect(text).toContain(s)
      expect(html).toContain(`href="${d.mapUrl}"`)
      expect(d.mapUrl).toBe(messages.performancesPage.rainPlanMapUrl)
      expect(text).not.toContain(directionsFor(locale, 'ljetno-kino').prose[0])
    })

    it(`${locale}: prose comes before the map link`, async () => {
      const { html } = await renderTicketEmail(makeInput({ locale }))
      const d = directionsFor(locale, 'ljetno-kino')
      expect(decode(html).indexOf(d.prose[0])).toBeLessThan(html.indexOf(`href="${d.mapUrl}"`))
    })
  }

  it('centres the new blocks with align="center" and fixed-pixel cells, never width:100%', async () => {
    const { html } = await renderTicketEmail(makeInput())
    // Three new blocks, each a table with align="center" and one fixed 488px cell.
    const blocks = html.match(/<table align="center" cellPadding="0" cellSpacing="0" style="border-collapse:collapse[^>]*>/g) ?? []
    expect(blocks.length).toBe(3)
    expect(html.match(/width:488px/g)).toHaveLength(3)
    for (const block of blocks) expect(block).not.toContain('width="100%"')
  })

  it('keeps the English and Croatian copy records on the same keys', () => {
    expect(Object.keys(__test__.COPY.hr).sort()).toEqual(Object.keys(__test__.COPY.en).sort())
  })

  it('uses no em dash in either copy record', () => {
    const flat = JSON.stringify(__test__.COPY, (_k, v) => (typeof v === 'function' ? v('x') : v))
    expect(flat).not.toContain('—')
  })
})
