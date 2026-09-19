import { describe, it, expect } from 'vitest'
import { renderTicketEmail, type RenderTicketEmailInput } from './render-ticket-email'

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
})

describe('renderTicketEmail entrance line (#674)', () => {
  it('tells the buyer when the entrance opens, in both languages', async () => {
    const { html: en } = await renderTicketEmail(makeInput())
    expect(en).toContain('Entrance')
    expect(en).toContain('around 20:30')

    const { html: hr } = await renderTicketEmail(makeInput({ locale: 'hr' }))
    expect(hr).toContain('Ulaz')
    expect(hr).toContain('oko 20:30')
  })

  it('still says when the performance starts', async () => {
    const { html } = await renderTicketEmail(makeInput())
    expect(html).toContain('21:00')
  })

  it('leaves the line out rather than guessing when the start time is unreadable', async () => {
    const { html } = await renderTicketEmail(
      makeInput({ show: { date: '2026-07-15', time: 'evening', venue: 'ljetno-kino' } }),
    )
    expect(html).not.toContain('Entrance')
  })
})
