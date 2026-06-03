import { describe, it, expect } from 'vitest'
import { toEnquiryType } from './enquiry-type'

describe('toEnquiryType', () => {
  it('passes stable service slugs straight through', () => {
    expect(toEnquiryType('private-moreska')).toBe('private-moreska')
    expect(toEnquiryType('moreska-experience')).toBe('moreska-experience')
  })

  it('maps EN contact-form labels onto the enum', () => {
    expect(toEnquiryType('General')).toBe('general')
    expect(toEnquiryType('Private Moreška')).toBe('private-moreska')
    expect(toEnquiryType('Moreška Experience')).toBe('moreska-experience')
    expect(toEnquiryType('Other')).toBe('other')
  })

  it('maps HR contact-form labels onto the enum', () => {
    expect(toEnquiryType('Općenito')).toBe('general')
    expect(toEnquiryType('Privatna moreška')).toBe('private-moreska')
    expect(toEnquiryType('moreška iskustvo')).toBe('moreska-experience')
    expect(toEnquiryType('Ostalo')).toBe('other')
  })

  it('folds "Press" / "Tisak" into other (no dedicated enum)', () => {
    expect(toEnquiryType('Press')).toBe('other')
    expect(toEnquiryType('Tisak')).toBe('other')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(toEnquiryType('  PRIVATE MOREŠKA  ')).toBe('private-moreska')
  })

  it('defaults unknown / empty input to general rather than dropping it', () => {
    expect(toEnquiryType('something new')).toBe('general')
    expect(toEnquiryType('')).toBe('general')
    expect(toEnquiryType(null)).toBe('general')
    expect(toEnquiryType(undefined)).toBe('general')
  })
})
