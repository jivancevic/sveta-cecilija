import { describe, expect, it } from 'vitest'
import { buildHealthReport, deployedCommit } from '@/lib/health/health'
import { APP_VERSION, versionLine } from './version'

// The acceptance criterion of #569: the line at the foot of Više and the body
// of `GET /api/health` name the SAME build.
//
// The two are read by different people for the same reason — "is this the
// commit I merged?" — and before this ticket only the route had an answer. A
// second env read on the page would have been a second answer, so the test
// below drives both off one fake environment and compares them.

const ENV = { SOURCE_COMMIT: 'ad0eb9c7f3a19bd0e4c1' } as unknown as NodeJS.ProcessEnv

describe('the version line', () => {
  it('prints the same commit /api/health reports, from the same environment', async () => {
    const report = await buildHealthReport({
      commit: deployedCommit(ENV),
      probeDb: async () => undefined,
    })

    const line = versionLine({ version: '1.2.3', commit: deployedCommit(ENV) })

    expect(report.commit).toBe('ad0eb9c')
    expect(line).toBe('Cecilija · 1.2.3 (ad0eb9c)')
    expect(line).toContain(report.commit as string)
  })

  it('says nothing about a commit outside a deploy, rather than "(null)"', async () => {
    const empty = {} as NodeJS.ProcessEnv
    const report = await buildHealthReport({
      commit: deployedCommit(empty),
      probeDb: async () => undefined,
    })

    expect(report.commit).toBeNull()
    expect(versionLine({ version: '1.2.3', commit: deployedCommit(empty) })).toBe('Cecilija · 1.2.3')
  })

  it('reads the version out of package.json rather than a re-typed constant', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
