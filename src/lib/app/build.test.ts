import { describe, expect, it } from 'vitest'
import { buildHealthReport, deployedCommit } from '@/lib/health/health'
import { buildLine } from './build'
import { supportMailto } from './support-mail'

// The acceptance criterion carried from #569 into #637: the line at the foot of
// Više and the body of `GET /api/health` name the SAME build.
//
// The two are read by different people for the same reason — "is this the
// commit I merged?" — and a second env read on the page would be a second
// answer, so the test below drives both off one fake environment and compares
// them.

const ENV = { SOURCE_COMMIT: 'ad0eb9c7f3a19bd0e4c1' } as unknown as NodeJS.ProcessEnv

describe('the build line', () => {
  it('prints the same commit /api/health reports, from the same environment', async () => {
    const report = await buildHealthReport({
      commit: deployedCommit(ENV),
      probeDb: async () => undefined,
    })

    const line = buildLine(deployedCommit(ENV))

    expect(report.commit).toBe('ad0eb9c')
    expect(line).toBe('Cecilija · ad0eb9c')
    expect(line).toContain(report.commit as string)
  })

  it('says nothing about a commit outside a deploy, rather than "(null)"', async () => {
    const empty = {} as NodeJS.ProcessEnv
    const report = await buildHealthReport({
      commit: deployedCommit(empty),
      probeDb: async () => undefined,
    })

    expect(report.commit).toBeNull()
    expect(buildLine(deployedCommit(empty))).toBe('Cecilija')
  })

  it('carries no version: the number in package.json never moved (#637)', () => {
    expect(buildLine('ad0eb9c')).not.toMatch(/\d+\.\d+\.\d+/)
  })
})

describe('the support mail', () => {
  // The sha is not meant to be transcribed, so this is the path that actually
  // carries it off the phone. The assertions are about what a developer needs
  // in order to answer at all.

  it('carries the same build the footer shows', () => {
    const body = decodeURIComponent(
      supportMailto({ commit: deployedCommit(ENV), username: 'tehnika' }),
    )
    expect(body).toContain('ad0eb9c')
  })

  it('names the ACCOUNT, because a shared login mails from a private address', () => {
    // `tehnika` has no e-mail of its own (ADR-0022), so the mail arrives from
    // whoever is holding the tablet and nothing else in it would say which
    // Cecilija account was signed in.
    const body = decodeURIComponent(supportMailto({ commit: 'ad0eb9c', username: 'tehnika' }))
    expect(body).toContain('Račun: tehnika')
  })

  it('goes to the one address, and never carries a telephone number', () => {
    const href = supportMailto({ commit: 'ad0eb9c', username: 'tehnika' })
    expect(href.startsWith('mailto:info@moreska.eu?')).toBe(true)
    expect(decodeURIComponent(href)).not.toMatch(/\+385|\d{3}[ /-]\d{3}/)
  })

  it('still opens a usable mail when there is no deploy and no username', () => {
    const body = decodeURIComponent(supportMailto({ commit: null, username: null }))
    expect(body).toContain('Opiši što se dogodilo')
    // Neither "Račun: null" nor a "Build:" label with nothing after it.
    expect(body).not.toContain('null')
    expect(body).not.toContain('Build:')
    expect(body).not.toContain('Račun:')
  })

  it('percent-encodes the body, so a newline cannot truncate the mail', () => {
    const href = supportMailto({ commit: 'ad0eb9c', username: 'tehnika' })
    expect(href).not.toContain('\n')
    expect(href).toContain('%0A')
  })
})
