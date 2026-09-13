import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import hr from '@/messages/hr.json'

// The digital programme (#544) is the one page a guest reads in the dark before
// the show, in whichever language their phone is set to. Nothing in tsc catches
// a Croatian key that went missing (the Dictionary type is inferred from
// en.json alone), so this asserts the two `programmePage` blocks stay parallel
// and that the fixed facts of the dance are what the page prints.

function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      keyPaths(v, prefix ? `${prefix}.${k}` : k),
    )
  }
  return [prefix]
}

describe('programmePage copy', () => {
  it('has identical key paths in English and Croatian', () => {
    expect(keyPaths(hr.programmePage).sort()).toEqual(keyPaths(en.programmePage).sort())
  })

  it('names seven kolapi in the published order, in both languages', () => {
    const order = ['Rugier', 'Moreška', 'Finta', 'Moro in dentro', 'Križ', 'Rugier de fuorivia']
    for (const block of [en.programmePage, hr.programmePage]) {
      expect(block.kolapi).toHaveLength(7)
      expect(block.kolapi.slice(0, 6).map((k) => k.name)).toEqual(order)
    }
    expect(en.programmePage.kolapi[6].name).toBe('Final figure')
    expect(hr.programmePage.kolapi[6].name).toBe('Završna figura')
  })

  it('describes the evening as two parts, klapa first, and names no minutes (#541)', () => {
    for (const block of [en.programmePage, hr.programmePage]) {
      expect(block.parts).toHaveLength(2)
      expect(block.parts[0].title.toLowerCase()).toContain('klapa')
      expect(block.parts[1].title.toLowerCase()).toContain('moreška')
      const flat = JSON.stringify(block.parts)
      expect(flat).not.toMatch(/\d+\s*(min|minut)/i)
    }
  })

  it('tells the guest the White King wears red, the one fact every reviewer got wrong', () => {
    const osmanEn = en.programmePage.cast.find((c) => c.name === 'Osman')
    const osmanHr = hr.programmePage.cast.find((c) => c.name === 'Osman')
    expect(osmanEn?.line).toMatch(/red/)
    expect(osmanHr?.line).toMatch(/crveno/)
  })

  it('carries the front-row note, thrill first then care, in one sentence pair', () => {
    expect(en.programmePage.frontRow).toMatch(/^The front rows/)
    expect(en.programmePage.frontRow).toMatch(/small children/)
    expect(hr.programmePage.frontRow).toMatch(/^Prvi redovi/)
    expect(hr.programmePage.frontRow).toMatch(/djecom/)
  })

  it('uses no em dash and keeps "moreška" lowercase mid-sentence in Croatian', () => {
    const flat = JSON.stringify(hr.programmePage)
    expect(flat).not.toContain('—')
    // Every occurrence of the dance name that is not sentence- or title-initial.
    for (const m of flat.matchAll(/[a-zćčšžđ] Moreška/g)) {
      throw new Error(`capitalised mid-sentence: ${m[0]}`)
    }
  })
})
