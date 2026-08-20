import { describe, it, expect } from 'vitest'
import { renderDateChangePreview, type SendDateChangeEmailInput } from './send-date-change-email'

const base: SendDateChangeEmailInput = {
  orderId: '10',
  buyer: { name: 'Ana Horvat', email: 'ana@example.com' },
  show: { oldDate: '2026-07-23', newDate: '2026-07-22', time: '21:00', venue: 'ljetno-kino' },
  refundUrl: 'https://moreska.eu/order/tok123/refund',
}

describe('renderDateChangePreview', () => {
  it('renders the buyer name and both old + new dates (EN)', () => {
    const { html, subject } = renderDateChangePreview(base, 'en')
    expect(subject).toMatch(/moved to a new date/i)
    expect(html).toContain('Ana Horvat')
    expect(html).toContain('Thursday, 23 July 2026') // struck-through old
    expect(html).toContain('Wednesday, 22 July 2026') // highlighted new
  })

  it('includes the secondary refund CTA pointing at the signed refund URL', () => {
    const { html } = renderDateChangePreview(base, 'en')
    expect(html).toContain('https://moreska.eu/order/tok123/refund')
    expect(html).toMatch(/Cancel &amp; refund my tickets|Cancel & refund my tickets/)
  })

  // #379: the reissued ticket arrives as a SEPARATE message, so the notice has
  // to announce it and say the QR codes are unchanged, or the two contradict.
  it('announces the separately-sent reissued ticket and unchanged QR codes (EN)', () => {
    const { html } = renderDateChangePreview(base, 'en')
    expect(html).toContain('separate email')
    expect(html).toMatch(/QR codes have not changed/i)
  })

  it('announces the separately-sent reissued ticket in Croatian too', () => {
    const { html } = renderDateChangePreview(base, 'hr')
    expect(html).toContain('zasebnoj poruci')
    expect(html).toMatch(/QR kodovi se nisu promijenili/i)
  })

  it('drops the old "reply to this email" escape hatch', () => {
    const { html } = renderDateChangePreview(base, 'en')
    expect(html.toLowerCase()).not.toContain('reply to this email')
    expect(html.toLowerCase()).not.toContain("we'll find a solution")
  })

  it('uses the brand-standard chrome (logo header, swords divider)', () => {
    const { html } = renderDateChangePreview(base, 'en')
    expect(html).toContain('/email/logo.png')
    expect(html).toContain('/email/swords.png')
  })

  it('omits the refund CTA entirely when no refundUrl was built', () => {
    const { html } = renderDateChangePreview({ ...base, refundUrl: undefined }, 'en')
    expect(html).not.toContain('/order/')
    expect(html).not.toMatch(/Cancel .{0,6}refund my tickets/)
  })

  it('renders the Croatian variant with the HR refund CTA', () => {
    const { html, subject } = renderDateChangePreview(base, 'hr')
    expect(subject).toMatch(/premještena je na novi datum/i)
    expect(html).toContain('Otkaži ulaznice i zatraži povrat')
    expect(html.toLowerCase()).not.toContain('reply to this email')
  })
})
