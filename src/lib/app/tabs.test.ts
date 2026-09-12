import { describe, expect, it } from 'vitest'
import { activeAppTab } from './tabs'

describe('activeAppTab', () => {
  it('lights Izvedbe for the home page and for one evening below it', () => {
    expect(activeAppTab('/app')).toBe('performances')
    expect(activeAppTab('/app/')).toBe('performances')
    expect(activeAppTab('/app/izvedba/42')).toBe('performances')
  })

  it('does not light Izvedbe for a path that merely starts with the word', () => {
    expect(activeAppTab('/app/izvedbe-arhiva')).toBeNull()
  })

  it('lights Moje for the season page', () => {
    expect(activeAppTab('/app/moje')).toBe('mine')
  })

  it('lights Više for its own page and for the pages reached from it', () => {
    expect(activeAppTab('/app/vise')).toBe('more')
    expect(activeAppTab('/app/statistika')).toBe('more')
    expect(activeAppTab('/app/statistika/')).toBe('more')
    // #463: the optional password, and the voditelj's invitations screen.
    expect(activeAppTab('/app/set-password')).toBe('more')
    expect(activeAppTab('/app/pozivnice')).toBe('more')
  })

  it('lights nothing on the pages that carry no bar', () => {
    expect(activeAppTab('/app/login')).toBeNull()
    expect(activeAppTab('/app/forgot')).toBeNull()
    expect(activeAppTab('/app/prijava')).toBeNull()
    expect(activeAppTab('/app/authorize')).toBeNull()
  })
})
