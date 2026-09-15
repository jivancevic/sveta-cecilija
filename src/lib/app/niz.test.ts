import { describe, expect, it } from 'vitest'
import {
  NIZ_MIN,
  currentNiz,
  currentNizByMember,
  flameNiz,
  longestNiz,
  nizChain,
  type NizPerformance,
} from './niz'

const show = (over: Partial<NizPerformance> & { id: string; date: string }): NizPerformance => ({
  kind: 'redovna',
  confirmed: true,
  cancelled: false,
  ...over,
})

const TODAY = '2026-09-15'

describe('nizChain', () => {
  it('is the confirmed moreske that have been danced, newest first', () => {
    const chain = nizChain(
      [
        show({ id: 'a', date: '2026-07-01' }),
        show({ id: 'c', date: '2026-08-01' }),
        show({ id: 'b', date: '2026-07-15' }),
      ],
      TODAY,
    )
    expect(chain).toEqual(['c', 'b', 'a'])
  })

  it('leaves out an Experience, so it neither counts nor breaks', () => {
    const chain = nizChain(
      [
        show({ id: 'a', date: '2026-07-01' }),
        show({ id: 'x', date: '2026-07-10', kind: 'experience' }),
        show({ id: 'b', date: '2026-07-20' }),
      ],
      TODAY,
    )
    expect(chain).toEqual(['b', 'a'])
  })

  it('skips a cancelled evening and one that was never confirmed', () => {
    const chain = nizChain(
      [
        show({ id: 'a', date: '2026-07-01' }),
        show({ id: 'cancelled', date: '2026-07-10', cancelled: true }),
        show({ id: 'draft', date: '2026-07-12', confirmed: false }),
        show({ id: 'b', date: '2026-07-20' }),
      ],
      TODAY,
    )
    expect(chain).toEqual(['b', 'a'])
  })

  it('leaves out an evening that has not happened yet, confirmed or not', () => {
    const chain = nizChain(
      [show({ id: 'past', date: '2026-09-14' }), show({ id: 'future', date: '2026-09-20' })],
      TODAY,
    )
    expect(chain).toEqual(['past'])
  })

  it('crosses seasons: January does not reset it', () => {
    const chain = nizChain(
      [
        show({ id: 'last-season', date: '2025-08-20' }),
        show({ id: 'this-season', date: '2026-06-01' }),
      ],
      TODAY,
    )
    expect(currentNiz(chain, new Set(['this-season', 'last-season']))).toBe(2)
  })
})

describe('currentNiz', () => {
  const chain = ['e5', 'e4', 'e3', 'e2', 'e1']

  it('counts backwards from the most recent evening', () => {
    expect(currentNiz(chain, new Set(['e5', 'e4', 'e3']))).toBe(3)
  })

  it('is zero when the most recent evening was missed, however long the run before it', () => {
    expect(currentNiz(chain, new Set(['e4', 'e3', 'e2', 'e1']))).toBe(0)
  })

  it('is zero for a dancer who has danced nothing', () => {
    expect(currentNiz(chain, new Set())).toBe(0)
  })

  it('is zero when there is no chain at all', () => {
    expect(currentNiz([], new Set(['e5']))).toBe(0)
  })
})

describe('longestNiz', () => {
  const chain = ['e6', 'e5', 'e4', 'e3', 'e2', 'e1']

  it('finds the longest run anywhere in the chain', () => {
    // Danced e4, e3, e2 - three in a row, ended two evenings ago.
    const best = longestNiz(chain, new Set(['e4', 'e3', 'e2']))
    // The ends are the dancer's OWN evenings (#634): oldest first, newest
    // last, and never the evening they missed.
    expect(best).toEqual({ length: 3, running: false, from: 'e2', to: 'e4' })
  })

  it('says so when the longest run is the one still going', () => {
    expect(longestNiz(chain, new Set(['e6', 'e5', 'e4', 'e3']))).toEqual({
      length: 4,
      running: true,
      from: 'e3',
      to: 'e6',
    })
  })

  it('gives a tie to the run that is still going', () => {
    // Two runs of two: e6-e5 (running) and e3-e2 (finished).
    expect(longestNiz(chain, new Set(['e6', 'e5', 'e3', 'e2']))).toEqual({
      length: 2,
      running: true,
      from: 'e5',
      to: 'e6',
    })
  })

  it('keeps a longer finished run over a shorter one still going', () => {
    expect(longestNiz(chain, new Set(['e6', 'e4', 'e3', 'e2']))).toEqual({
      length: 3,
      running: false,
      from: 'e2',
      to: 'e4',
    })
  })

  it('is zero and not running for a dancer who has danced nothing', () => {
    expect(longestNiz(chain, new Set())).toEqual({
      length: 0,
      running: false,
      from: null,
      to: null,
    })
  })
})

describe('flameNiz', () => {
  it('draws nothing under the threshold', () => {
    expect(flameNiz(NIZ_MIN - 1)).toBeNull()
    expect(flameNiz(0)).toBeNull()
  })

  it('draws the number from the threshold up', () => {
    expect(flameNiz(NIZ_MIN)).toBe(NIZ_MIN)
    expect(flameNiz(9)).toBe(9)
  })
})

describe('currentNizByMember', () => {
  const chain = ['e3', 'e2', 'e1']

  it('gives every dancer their running niz and leaves out the broken ones', () => {
    const map = currentNizByMember(chain, [
      { performanceId: 'e3', memberId: 'ana' },
      { performanceId: 'e2', memberId: 'ana' },
      { performanceId: 'e1', memberId: 'ana' },
      // Missed the last one: no run at all, so no key.
      { performanceId: 'e2', memberId: 'bo' },
      { performanceId: 'e1', memberId: 'bo' },
      { performanceId: 'e3', memberId: 'cvi' },
    ])
    expect(map).toEqual({ ana: 3, cvi: 1 })
  })

  it('ignores a lineup row of an evening outside the chain', () => {
    const map = currentNizByMember(chain, [
      { performanceId: 'experience', memberId: 'ana' },
      { performanceId: 'e3', memberId: 'ana' },
    ])
    expect(map).toEqual({ ana: 1 })
  })

  it('counts a duplicated lineup row once', () => {
    const map = currentNizByMember(chain, [
      { performanceId: 'e3', memberId: 'ana' },
      { performanceId: 'e3', memberId: 'ana' },
    ])
    expect(map).toEqual({ ana: 1 })
  })
})
