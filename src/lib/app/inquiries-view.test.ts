import { describe, expect, it } from 'vitest'
import type { InquiryRow } from '@/lib/repo/inquiries'
import {
  foundLabel,
  inquiryRowView,
  isBookingInquiry,
  snippet,
  stateLabel,
  typeLabel,
} from './inquiries-view'

const ROW: InquiryRow = {
  id: '12',
  name: 'Ana Anić',
  email: 'ana@example.com',
  enquiryType: 'private-moreska',
  status: 'new',
  message: 'Zanima nas privatna izvedba za grupu od 40 ljudi.',
  createdAt: '2026-08-14T10:30:00.000Z',
}

describe('isBookingInquiry — the one distinction the inbox makes', () => {
  it('calls the two service enquiries bookings, because they are money', () => {
    expect(isBookingInquiry('private-moreska')).toBe(true)
    expect(isBookingInquiry('moreska-experience')).toBe(true)
  })

  it('calls everything else general', () => {
    expect(isBookingInquiry('general')).toBe(false)
    expect(isBookingInquiry('other')).toBe(false)
  })
})

describe('typeLabel and stateLabel', () => {
  it('names the enquiry type in Croatian', () => {
    expect(typeLabel('private-moreska')).toBe('Privatna moreška')
    expect(typeLabel('general')).toBe('Općenito')
  })

  it('names the two states of the lifecycle', () => {
    expect(stateLabel('new')).toBe('Novi')
    expect(stateLabel('handled')).toBe('Riješeni')
  })
})

describe('snippet', () => {
  it('folds a multi-line message into one line', () => {
    expect(snippet('prvi red\n\ndrugi red')).toBe('prvi red drugi red')
  })

  it('marks the cut, and never grows past the limit plus the marker', () => {
    const text = snippet('a'.repeat(10) + ' ' + 'b'.repeat(200), 40)
    expect(text.length).toBeLessThanOrEqual(43)
    expect(text.endsWith('...')).toBe(true)
  })

  it('cuts on a space when one falls near the end rather than mid-word', () => {
    const text = snippet('riječ '.repeat(12), 40)
    expect(text.endsWith('...')).toBe(true)
    expect(text.slice(0, -3).endsWith('riječ')).toBe(true)
  })

  it('leaves a short message exactly as it is', () => {
    expect(snippet('kratko')).toBe('kratko')
  })
})

describe('foundLabel', () => {
  it('counts enquiries with the Croatian plural', () => {
    expect(foundLabel(1)).toBe('1 upit')
    expect(foundLabel(3)).toBe('3 upita')
    expect(foundLabel(11)).toBe('11 upita')
    expect(foundLabel(0)).toBe('0 upita')
  })
})

describe('inquiryRowView', () => {
  it('gathers everything one row prints, with the booking flag on it', () => {
    const view = inquiryRowView(ROW)
    expect(view.href).toBe('/app/inquiries/12')
    expect(view.name).toBe('Ana Anić')
    expect(view.type).toBe('Privatna moreška')
    expect(view.booking).toBe(true)
    expect(view.isNew).toBe(true)
    expect(view.preview).toContain('Zanima nas privatna izvedba')
    expect(view.when).toContain('kolovoza')
  })

  it('does not flag a general enquiry, and knows a handled one', () => {
    const view = inquiryRowView({ ...ROW, enquiryType: 'general', status: 'handled' })
    expect(view.booking).toBe(false)
    expect(view.isNew).toBe(false)
  })

  it('names a nameless enquiry rather than printing a gap', () => {
    expect(inquiryRowView({ ...ROW, name: '   ' }).name).toBe('Bez imena')
  })
})
