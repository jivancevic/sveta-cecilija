import { describe, expect, it } from 'vitest'
import { APP_STRINGS } from './strings'
import {
  PERFORMANCE_ACTIONS,
  mayCancelBooking,
  mayWritePerformance,
  performanceActionGates,
} from './performance-actions'

// The per-action gate of Izvedbe (#567, Q53).
//
// The acceptance of the ticket is here in two halves: a `moreska`-only set may
// write an izvedba (`mayWritePerformance`) and may press none of the money
// actions, with "traži Blagajnu" under each of them. The other half — that the
// ROUTE refuses the same request — lives in `performance-form.test.ts` and in
// the cancel route's own test, because a caption is not a refusal.

const S = APP_STRINGS.showActions

describe('performanceActionGates', () => {
  it('opens all six for the blagajna who may also refund', () => {
    const gates = performanceActionGates(['tickets', 'refunds'])
    for (const action of PERFORMANCE_ACTIONS) {
      expect(gates[action]).toEqual({ action, enabled: true, reason: null })
    }
  })

  it('greys every action for a `moreska`-only login and names the Blagajna', () => {
    const gates = performanceActionGates(['moreska'])
    for (const action of PERFORMANCE_ACTIONS) {
      expect(gates[action].enabled).toBe(false)
      expect(gates[action].reason).toBe(S.needsBox)
    }
  })

  it('greys Otkaži for the blagajna without `refunds`, and says which key is missing', () => {
    const gates = performanceActionGates(['tickets'])

    expect(gates.cancel).toEqual({
      action: 'cancel',
      enabled: false,
      reason: S.needsRefundsCaption,
    })
    // The other five are the desk's own work and stay open.
    expect(gates.pause.enabled).toBe(true)
    expect(gates.reschedule.enabled).toBe(true)
    expect(gates.move.enabled).toBe(true)
    expect(gates.door.enabled).toBe(true)
    expect(gates.orders.enabled).toBe(true)
  })

  it('refuses a `refunds` holder who is not the blagajna, and points at the desk', () => {
    const gates = performanceActionGates(['refunds', 'moreska'])

    expect(gates.cancel).toEqual({ action: 'cancel', enabled: false, reason: S.needsBox })
  })

  it('never enables anything for a set that holds neither word', () => {
    const gates = performanceActionGates(['door', 'moreskant'])
    expect(PERFORMANCE_ACTIONS.every((a) => !gates[a].enabled)).toBe(true)
  })
})

describe('mayWritePerformance', () => {
  it('lets both halves of Izvedbe enter and correct an evening (#567)', () => {
    expect(mayWritePerformance(['moreska'])).toBe(true)
    expect(mayWritePerformance(['tickets'])).toBe(true)
  })

  it('is false for a set that unlocks the screen through neither word', () => {
    expect(mayWritePerformance(['door'])).toBe(false)
    expect(mayWritePerformance([])).toBe(false)
  })
})

describe('mayCancelBooking', () => {
  it('stays the voditelj’s: a booking sells nothing, so cancelling it mails nobody', () => {
    expect(mayCancelBooking(['moreska'])).toBe(true)
    expect(mayCancelBooking(['tickets', 'refunds'])).toBe(false)
  })
})
