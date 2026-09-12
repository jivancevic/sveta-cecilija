import { describe, expect, it } from 'vitest'
import { needsOnboarding } from './onboarding'

const base = { signedIn: true, denied: false, hasMember: true, cookiePresent: false }

describe('needsOnboarding', () => {
  it('welcomes a signed-in dancer whose device has not seen it', () => {
    expect(needsOnboarding(base)).toBe(true)
  })

  it('never welcomes the same device twice', () => {
    expect(needsOnboarding({ ...base, cookiePresent: true })).toBe(false)
  })

  it('leaves a signed-out visitor to the login', () => {
    expect(needsOnboarding({ ...base, signedIn: false })).toBe(false)
  })

  it('leaves a denied account on its own page', () => {
    expect(needsOnboarding({ ...base, denied: true })).toBe(false)
  })

  it('skips an account with no moreškant behind it', () => {
    expect(needsOnboarding({ ...base, hasMember: false })).toBe(false)
  })
})
