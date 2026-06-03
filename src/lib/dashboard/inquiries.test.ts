import { describe, it, expect, vi } from 'vitest'
import {
  countInquiries,
  isBookingEnquiry,
  markEnquiryHandled,
  formatInquiriesBadge,
  BOOKING_ENQUIRY_TYPES,
  type InquiryRow,
} from './inquiries'

const newGeneral = (): InquiryRow => ({ status: 'new', enquiryType: 'general' })
const newOther = (): InquiryRow => ({ status: 'new', enquiryType: 'other' })
const newPrivate = (): InquiryRow => ({ status: 'new', enquiryType: 'private-moreska' })
const newExperience = (): InquiryRow => ({ status: 'new', enquiryType: 'moreska-experience' })

describe('isBookingEnquiry', () => {
  it('treats private-moreska and moreska-experience as booking enquiries', () => {
    expect(isBookingEnquiry('private-moreska')).toBe(true)
    expect(isBookingEnquiry('moreska-experience')).toBe(true)
  })

  it('treats general and other as non-booking', () => {
    expect(isBookingEnquiry('general')).toBe(false)
    expect(isBookingEnquiry('other')).toBe(false)
  })

  it('exposes exactly the two booking types', () => {
    expect([...BOOKING_ENQUIRY_TYPES].sort()).toEqual(['moreska-experience', 'private-moreska'])
  })
})

describe('countInquiries', () => {
  it('counts only new enquiries (handled ones are excluded)', () => {
    const rows: InquiryRow[] = [
      newGeneral(),
      newPrivate(),
      { status: 'handled', enquiryType: 'general' },
      { status: 'handled', enquiryType: 'private-moreska' },
    ]
    expect(countInquiries(rows)).toEqual({ count: 2, bookingCount: 1 })
  })

  it('counts the booking sub-count within the new total', () => {
    const rows: InquiryRow[] = [
      newGeneral(),
      newOther(),
      newPrivate(),
      newExperience(),
      newPrivate(),
    ]
    // 5 new, 3 of them booking (2 private + 1 experience)
    expect(countInquiries(rows)).toEqual({ count: 5, bookingCount: 3 })
  })

  it('returns zeros for an empty list', () => {
    expect(countInquiries([])).toEqual({ count: 0, bookingCount: 0 })
  })

  it('does not count handled booking enquiries toward the booking sub-count', () => {
    const rows: InquiryRow[] = [
      { status: 'handled', enquiryType: 'private-moreska' },
      { status: 'handled', enquiryType: 'moreska-experience' },
      newGeneral(),
    ]
    expect(countInquiries(rows)).toEqual({ count: 1, bookingCount: 0 })
  })
})

describe('formatInquiriesBadge', () => {
  it('English: total plus booking sub-count, no em-dash', () => {
    const text = formatInquiriesBadge('en', { count: 5, bookingCount: 2 })
    expect(text).toBe('5 new, incl. 2 booking enquiries')
    expect(text).not.toContain('—')
  })

  it('English: omits the booking clause when none are booking', () => {
    expect(formatInquiriesBadge('en', { count: 3, bookingCount: 0 })).toBe('3 new')
  })

  it('English: singular booking enquiry', () => {
    expect(formatInquiriesBadge('en', { count: 4, bookingCount: 1 })).toBe('4 new, incl. 1 booking enquiry')
  })

  it('Croatian: total plus booking sub-count, no em-dash', () => {
    const text = formatInquiriesBadge('hr', { count: 5, bookingCount: 2 })
    expect(text).toContain('5')
    expect(text).toContain('2')
    expect(text).not.toContain('—')
    // booking enquiries are surfaced (rezervacij* stem)
    expect(text.toLowerCase()).toContain('rezervacij')
  })

  it('Croatian: omits the booking clause when none are booking', () => {
    const text = formatInquiriesBadge('hr', { count: 3, bookingCount: 0 })
    expect(text).toContain('3')
    expect(text.toLowerCase()).not.toContain('rezervacij')
  })

  it('handles zero new enquiries in both languages', () => {
    expect(formatInquiriesBadge('en', { count: 0, bookingCount: 0 })).toBe('0 new')
    expect(formatInquiriesBadge('hr', { count: 0, bookingCount: 0 })).toContain('0')
  })
})

describe('markEnquiryHandled (new → handled transition)', () => {
  it('flips a new enquiry to handled via the injected update', async () => {
    const update = vi.fn().mockResolvedValue({ id: 7, status: 'handled' })
    const result = await markEnquiryHandled(7, { update })
    expect(update).toHaveBeenCalledWith(7)
    expect(result).toEqual({ id: 7, status: 'handled' })
  })

  it('is idempotent: marking an already-handled enquiry handled is a safe no-op-shaped result', async () => {
    // The injected update is responsible for the actual write; re-running it on an
    // already-handled row still resolves to a handled row (the count simply won't drop again).
    const update = vi.fn().mockResolvedValue({ id: 7, status: 'handled' })
    const result = await markEnquiryHandled(7, { update })
    expect(result.status).toBe('handled')
  })
})
