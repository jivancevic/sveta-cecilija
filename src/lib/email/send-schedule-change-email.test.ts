import { describe, it, expect } from 'vitest'
import {
  renderScheduleChangePreview,
  scheduleChangeOf,
  type SendScheduleChangeEmailInput,
} from './send-schedule-change-email'

const base: SendScheduleChangeEmailInput = {
  orderId: '10',
  buyer: { name: 'Ana Horvat', email: 'ana@example.com' },
  show: {
    oldDate: '2026-07-23',
    newDate: '2026-07-22',
    oldTime: '21:00',
    newTime: '21:00',
    venue: 'ljetno-kino',
  },
  refundUrl: 'https://moreska.eu/order/tok123/refund',
}

/** The same evening, one hour earlier and not a day later (#688). */
const timeOnly: SendScheduleChangeEmailInput = {
  ...base,
  show: { ...base.show, oldDate: '2026-07-23', newDate: '2026-07-23', oldTime: '21:00', newTime: '18:00' },
}

const both: SendScheduleChangeEmailInput = {
  ...base,
  show: { ...base.show, oldTime: '21:00', newTime: '18:00' },
}

describe('renderScheduleChangePreview', () => {
  it('renders the buyer name and both old + new dates (EN)', () => {
    const { html, subject } = renderScheduleChangePreview(base, 'en')
    expect(subject).toMatch(/moved to a new date/i)
    expect(html).toContain('Ana Horvat')
    expect(html).toContain('Thursday, 23 July 2026') // struck-through old
    expect(html).toContain('Wednesday, 22 July 2026') // highlighted new
  })

  it('includes the secondary refund CTA pointing at the signed refund URL', () => {
    const { html } = renderScheduleChangePreview(base, 'en')
    expect(html).toContain('https://moreska.eu/order/tok123/refund')
    expect(html).toMatch(/Cancel &amp; refund my tickets|Cancel & refund my tickets/)
  })

  // #379: the reissued ticket arrives as a SEPARATE message, so the notice has
  // to announce it and say the QR codes are unchanged, or the two contradict.
  it('announces the separately-sent reissued ticket and unchanged QR codes (EN)', () => {
    const { html } = renderScheduleChangePreview(base, 'en')
    expect(html).toContain('separate email')
    expect(html).toMatch(/QR codes have not changed/i)
  })

  it('announces the separately-sent reissued ticket in Croatian too', () => {
    const { html } = renderScheduleChangePreview(base, 'hr')
    expect(html).toContain('zasebnoj poruci')
    expect(html).toMatch(/QR kodovi se nisu promijenili/i)
  })

  it('drops the old "reply to this email" escape hatch', () => {
    const { html } = renderScheduleChangePreview(base, 'en')
    expect(html.toLowerCase()).not.toContain('reply to this email')
    expect(html.toLowerCase()).not.toContain("we'll find a solution")
  })

  it('uses the brand-standard chrome (logo header, swords divider)', () => {
    const { html } = renderScheduleChangePreview(base, 'en')
    expect(html).toContain('/email/logo.png')
    expect(html).toContain('/email/swords.png')
  })

  it('omits the refund CTA entirely when no refundUrl was built', () => {
    const { html } = renderScheduleChangePreview({ ...base, refundUrl: undefined }, 'en')
    expect(html).not.toContain('/order/')
    expect(html).not.toMatch(/Cancel .{0,6}refund my tickets/)
  })

  it('renders the Croatian variant with the HR refund CTA', () => {
    const { html, subject } = renderScheduleChangePreview(base, 'hr')
    expect(subject).toMatch(/premještena je na novi datum/i)
    expect(html).toContain('Otkaži ulaznice i zatraži povrat')
    expect(html.toLowerCase()).not.toContain('reply to this email')
  })
})

// #688 — the hour moves under a ticket holder as easily as the day, so the same
// notice says so. What changes with it is FOUR lines: the subject, the heading,
// the reassurance and the refund invitation. Everything else is one message.
describe('scheduleChangeOf', () => {
  it('reads which half moved off the two schedules rather than trusting a flag', () => {
    expect(scheduleChangeOf(base.show)).toBe('date')
    expect(scheduleChangeOf(timeOnly.show)).toBe('time')
    expect(scheduleChangeOf(both.show)).toBe('both')
  })
})

describe('a time-only change (#688)', () => {
  it('names the hour, not the date, in the EN subject and heading', () => {
    const { html, subject } = renderScheduleChangePreview(timeOnly, 'en')
    expect(subject).toMatch(/new start time/i)
    expect(subject).not.toMatch(/new date/i)
    expect(html).toMatch(/has a new start time/i)
  })

  it('names the hour in the HR subject and heading', () => {
    const { html, subject } = renderScheduleChangePreview(timeOnly, 'hr')
    expect(subject).toMatch(/počinje u novo vrijeme/i)
    expect(subject).not.toMatch(/novi datum/i)
    expect(html).toMatch(/Promjena satnice/i)
  })

  it('struck-through side is the old HOUR alone, and the new side the whole schedule', () => {
    const { html } = renderScheduleChangePreview(timeOnly, 'en')
    expect(html).toContain('>21:00</div>')
    expect(html).toContain('Thursday, 23 July 2026 · 18:00')
    // The unchanged date is not repeated on the struck-through side.
    expect(html).not.toContain('Thursday, 23 July 2026 · 21:00')
  })

  it('offers the same self-serve refund, worded for the hour, in both locales', () => {
    expect(renderScheduleChangePreview(timeOnly, 'en').html).toMatch(
      /new start time no longer works for you/i,
    )
    expect(renderScheduleChangePreview(timeOnly, 'hr').html).toMatch(
      /novo vrijeme početka više ne odgovara/i,
    )
    expect(renderScheduleChangePreview(timeOnly, 'en').html).toContain(
      'https://moreska.eu/order/tok123/refund',
    )
  })

  it('says the reissued ticket carries the new start time', () => {
    expect(renderScheduleChangePreview(timeOnly, 'en').html).toMatch(
      /new start time printed on it/i,
    )
    expect(renderScheduleChangePreview(timeOnly, 'hr').html).toMatch(
      /novim vremenom početka/i,
    )
  })

  it('still states the venue, which a time move does not touch', () => {
    expect(renderScheduleChangePreview(timeOnly, 'en').html).toContain('Summer Cinema')
    expect(renderScheduleChangePreview(timeOnly, 'hr').html).toContain('Ljetno kino')
  })
})

describe('a change to both halves (#688)', () => {
  it('names both in the subject and the heading, EN and HR', () => {
    const en = renderScheduleChangePreview(both, 'en')
    expect(en.subject).toMatch(/new date and time/i)
    expect(en.html).toMatch(/has a new date and time/i)
    const hr = renderScheduleChangePreview(both, 'hr')
    expect(hr.subject).toMatch(/novi datum i vrijeme/i)
    expect(hr.html).toMatch(/Promjena datuma i satnice/i)
  })

  it('shows the whole old schedule struck through against the whole new one', () => {
    const { html } = renderScheduleChangePreview(both, 'en')
    expect(html).toContain('Thursday, 23 July 2026 · 21:00')
    expect(html).toContain('Wednesday, 22 July 2026 · 18:00')
  })
})
