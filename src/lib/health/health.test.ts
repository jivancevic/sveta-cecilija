import { describe, it, expect } from 'vitest'
import { buildHealthReport, shortCommit } from './health'

describe('shortCommit', () => {
  it('shortens a full sha to seven characters', () => {
    expect(shortCommit('9b135d11af415dc9b3d74dcee6a534e20b9f7477')).toBe('9b135d1')
  })

  it('is null when the environment carries no commit', () => {
    expect(shortCommit(undefined)).toBeNull()
    expect(shortCommit(null)).toBeNull()
    expect(shortCommit('   ')).toBeNull()
  })
})

describe('buildHealthReport', () => {
  it('reports ok with a reachable database', async () => {
    const report = await buildHealthReport({
      commit: '9b135d11af415dc9b3d74dcee6a534e20b9f7477',
      probeDb: async () => ({ rows: [{ '?column?': 1 }] }),
    })
    expect(report).toEqual({ ok: true, commit: '9b135d1', dbOk: true })
  })

  // The contract that keeps Coolify from restart-looping a healthy container
  // over a transient Postgres blip: the probe decides `dbOk`, never the status.
  it('stays ok when the database probe throws', async () => {
    const report = await buildHealthReport({
      commit: 'abc1234',
      probeDb: async () => {
        throw new Error('ECONNREFUSED')
      },
    })
    expect(report.ok).toBe(true)
    expect(report.dbOk).toBe(false)
  })

  it('stays ok when the database probe hangs past the deadline', async () => {
    const report = await buildHealthReport({
      commit: null,
      probeDb: () => new Promise(() => {}),
      timeoutMs: 10,
    })
    expect(report).toEqual({ ok: true, commit: null, dbOk: false })
  })

  it('resolves before the deadline rather than waiting it out', async () => {
    const started = Date.now()
    const report = await buildHealthReport({
      probeDb: async () => 1,
      timeoutMs: 5000,
    })
    expect(report.dbOk).toBe(true)
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
