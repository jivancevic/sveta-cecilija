import { describe, it, expect } from 'vitest'
import { remainingSeats, assertCanSell } from './seat-availability'

const base = { capacity: 320, activeTicketCount: 0, inPersonSold: 0, legacyReserved: 0 }

describe('remainingSeats', () => {
  it('subtracts active tickets, in-person sales and legacy holds from capacity', () => {
    expect(remainingSeats({ capacity: 320, activeTicketCount: 100, inPersonSold: 20, legacyReserved: 30 })).toBe(170)
  })

  it('equals capacity when nothing is sold', () => {
    expect(remainingSeats(base)).toBe(320)
  })

  it('can go negative when oversold', () => {
    expect(remainingSeats({ capacity: 250, activeTicketCount: 240, inPersonSold: 20, legacyReserved: 0 })).toBe(-10)
  })
})

describe('assertCanSell', () => {
  it('allows a sale that fits exactly', () => {
    expect(() => assertCanSell({ ...base, activeTicketCount: 318 }, 2)).not.toThrow()
  })

  it('rejects a sale that would oversell', () => {
    expect(() => assertCanSell({ ...base, activeTicketCount: 319 }, 2)).toThrow(/only 1 seat/)
  })

  it('reports 0 remaining (never negative) in the message when already full', () => {
    expect(() => assertCanSell({ ...base, activeTicketCount: 325 }, 1)).toThrow(/only 0 seat/)
  })

  it('rejects non-positive or non-integer requests', () => {
    expect(() => assertCanSell(base, 0)).toThrow(/positive integer/)
    expect(() => assertCanSell(base, -3)).toThrow(/positive integer/)
    expect(() => assertCanSell(base, 1.5)).toThrow(/positive integer/)
  })
})
