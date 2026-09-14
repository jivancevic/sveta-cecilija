import { describe, expect, it } from 'vitest'
import { kindTone, kindWord } from './performance-kind'
import { PERFORMANCE_KINDS } from '@/lib/show-performance'

// The one place that knows an evening has THREE categories (#591).
//
// Q30 of #565 had two, and "Vanredna" covered everything that was not a
// redovna. An Experience is a form of its own — its own postava, its own half
// of Ljestvica — so it reads as itself now, and every other non-regular kind
// keeps the notebook's word.

describe('kindWord', () => {
  it('names a Redovna and nothing else by name', () => {
    expect(kindWord('redovna')).toBe('Redovna')
  })

  it('names an Experience in English, which is what the society calls it', () => {
    expect(kindWord('experience')).toBe('Experience')
  })

  // The client is the voditelj's business and lives on Izvedbe. A dancer reads
  // one word, and for a booking it is the one the notebook has always used.
  it.each(['dmc', 'gulliver', 'koncert', 'ostalo'])('calls a %s evening Vanredna', (kind) => {
    expect(kindWord(kind)).toBe('Vanredna')
  })

  it('never prints a database value, whatever arrives', () => {
    for (const kind of PERFORMANCE_KINDS) {
      expect(['Redovna', 'Vanredna', 'Experience']).toContain(kindWord(kind))
    }
    // A kind nobody has heard of is a booking, not a crash and not its own word.
    expect(kindWord('nesto-novo')).toBe('Vanredna')
  })
})

describe('kindTone', () => {
  it('splits the season three ways, and only the Experience is its own', () => {
    expect(kindTone('redovna')).toBe('regular')
    expect(kindTone('experience')).toBe('experience')
    expect(kindTone('dmc')).toBe('extra')
    expect(kindTone('koncert')).toBe('extra')
    expect(kindTone('ostalo')).toBe('extra')
  })

  it('agrees with the word: one rule, read twice', () => {
    for (const kind of PERFORMANCE_KINDS) {
      const expected =
        kindTone(kind) === 'regular'
          ? 'Redovna'
          : kindTone(kind) === 'experience'
            ? 'Experience'
            : 'Vanredna'
      expect(kindWord(kind)).toBe(expected)
    }
  })
})
