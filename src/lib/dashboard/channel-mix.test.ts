import { describe, it, expect } from 'vitest'
import { channelMix } from './channel-mix'

describe('channelMix', () => {
  it('is all-zero with no sales (no division by zero)', () => {
    const mix = channelMix({ online: 0, inPerson: 0, partner: 0 })
    expect(mix.total).toBe(0)
    expect(mix.segments.map((s) => s.percent)).toEqual([0, 0, 0])
  })

  it('sums the three channels into a season total', () => {
    const mix = channelMix({ online: 120, inPerson: 60, partner: 20 })
    expect(mix.total).toBe(200)
    expect(mix).toMatchObject({ online: 120, inPerson: 60, partner: 20 })
  })

  it('orders segments online, in-person, partner with their counts', () => {
    const mix = channelMix({ online: 50, inPerson: 30, partner: 20 })
    expect(mix.segments).toEqual([
      { key: 'online', count: 50, percent: 50 },
      { key: 'inPerson', count: 30, percent: 30 },
      { key: 'partner', count: 20, percent: 20 },
    ])
  })

  it('rounds each share to a whole-number percent', () => {
    const mix = channelMix({ online: 1, inPerson: 1, partner: 1 })
    // 33.33% each -> rounded to 33
    expect(mix.segments.map((s) => s.percent)).toEqual([33, 33, 33])
  })
})
