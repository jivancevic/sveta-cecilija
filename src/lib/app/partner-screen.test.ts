import { describe, expect, it } from 'vitest'
import {
  partnerScreenState,
  saleTotalCents,
  sellOptions,
  shortShowDay,
  stepperMax,
  type SellShowInput,
} from './partner-screen'

// The pure half of Prodaja (#505). Four rules that were inline and untested in
// the Backoffice partner dashboard: what a login with no usable Partner sees,
// how a performance reads in the picker, how far a stepper may go against the
// seats actually left, and what a party of N costs.

const show = (over: Partial<SellShowInput> = {}): SellShowInput => ({
  id: '12',
  date: '2026-07-17',
  time: '21:30',
  venue: 'ljetno-kino',
  remaining: 40,
  ...over,
})

describe('partnerScreenState', () => {
  it('opens the screen for a live partner', () => {
    const partner = { id: '7', name: 'Kaleta', active: true, commissionPercent: 10 }
    expect(partnerScreenState(partner)).toEqual({ kind: 'ok', partner })
  })

  it('refuses a login whose Partner link is missing or dangling', () => {
    expect(partnerScreenState(null)).toEqual({ kind: 'unlinked' })
    expect(partnerScreenState(undefined)).toEqual({ kind: 'unlinked' })
  })

  it('refuses a deactivated partner by name, so the person knows which account', () => {
    expect(
      partnerScreenState({ id: '7', name: 'Kaleta', active: false, commissionPercent: 10 }),
    ).toEqual({ kind: 'inactive', name: 'Kaleta' })
  })
})

describe('sellOptions', () => {
  it('labels a performance with its day, its clock and its venue', () => {
    const [option] = sellOptions([show()])
    expect(option.id).toBe('12')
    expect(option.label).toBe('Petak, 17. srpnja · 21:30 · Ljetno kino')
  })

  it('marks a performance with no seat left as sold out', () => {
    const [full, empty] = sellOptions([show(), show({ id: '13', remaining: 0 })])
    expect(full.soldOut).toBe(false)
    expect(empty.soldOut).toBe(true)
  })

  it('treats a negative remaining (an oversold evening) as sold out, never as seats', () => {
    const [option] = sellOptions([show({ remaining: -3 })])
    expect(option).toMatchObject({ remaining: 0, soldOut: true })
  })

  it('keeps an unknown venue slug rather than printing nothing', () => {
    const [option] = sellOptions([show({ venue: 'kino-bez-imena' })])
    expect(option.label).toContain('kino-bez-imena')
  })
})

describe('stepperMax', () => {
  it('lets one category take every seat the other has not claimed', () => {
    expect(stepperMax(40, 0)).toBe(40)
    expect(stepperMax(40, 6)).toBe(34)
  })

  it('never goes below zero, whatever the other category holds', () => {
    expect(stepperMax(4, 9)).toBe(0)
    expect(stepperMax(0, 0)).toBe(0)
  })
})

describe('shortShowDay', () => {
  it('shortens a calendar date to the day and the short month', () => {
    expect(shortShowDay('2026-09-24')).toBe('24. ruj')
    expect(shortShowDay('2026-07-01')).toBe('1. srp')
  })

  it('never goes through a Date, so no zone can move the day', () => {
    // 31 December at UTC midnight is 1 January in Zagreb; a calendar date must
    // survive that unchanged, because it is a day and not an instant.
    expect(shortShowDay('2026-12-31')).toBe('31. pro')
  })

  it('hands back anything that is not a date rather than printing NaN', () => {
    expect(shortShowDay('')).toBe('')
    expect(shortShowDay('nije datum')).toBe('nije datum')
  })
})

describe('saleTotalCents', () => {
  it('charges the fixed 20 EUR adult and 10 EUR child prices', () => {
    expect(saleTotalCents(2, 3)).toBe(7000)
    expect(saleTotalCents(0, 0)).toBe(0)
    expect(saleTotalCents(1, 0)).toBe(2000)
  })
})
