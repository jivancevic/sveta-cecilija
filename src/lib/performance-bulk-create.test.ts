import { describe, expect, it } from 'vitest'
import { createPerformancesInBulk, type BulkCreateDeps } from './performance-bulk-create'
import { SKIP_ROSTER_PUSH } from './push/shows-hook'

// The shared writer behind `/api/shows/bulk-create`, the MCP `create_performances`
// tool and (since #503) the voditelj's own "Dodaj izvedbu".
//
// What is asserted is the announcement rule, because that is the part a caller
// cannot see and would otherwise get wrong: a BATCH stays quiet per row and
// says one thing at the end, a SINGLE performance announces itself the way any
// save does.

function fakeDeps() {
  const created: { data: Record<string, unknown>; context: Record<string, unknown> }[] = []
  const announced: { count: number; firstDate: string }[] = []
  let transactions = 0

  const deps: BulkCreateDeps<'tx'> = {
    withTransaction: async (fn) => {
      transactions += 1
      return fn('tx')
    },
    create: async (args) => {
      created.push(args)
    },
    announce: (input) => {
      announced.push(input)
    },
  }
  return { deps, created, announced, transactions: () => transactions }
}

const row = (dateStr: string) => ({ dateStr, data: { date: dateStr, kind: 'dmc' } })

describe('createPerformancesInBulk', () => {
  it('writes every row in order inside one transaction', async () => {
    const { deps, created, transactions } = fakeDeps()
    const res = await createPerformancesInBulk(
      [row('2027-05-04'), row('2027-05-06'), row('2027-05-09')],
      deps,
    )

    expect(res.created).toEqual(['2027-05-04', '2027-05-06', '2027-05-09'])
    expect(created.map((c) => c.data.date)).toEqual(['2027-05-04', '2027-05-06', '2027-05-09'])
    expect(transactions()).toBe(1)
  })

  it('keeps a batch quiet per row and announces it once, pointing at the first date', async () => {
    const { deps, created, announced } = fakeDeps()
    await createPerformancesInBulk([row('2027-05-04'), row('2027-05-06')], deps)

    for (const c of created) expect(c.context[SKIP_ROSTER_PUSH]).toBe(true)
    expect(announced).toEqual([{ count: 2, firstDate: '2027-05-04' }])
  })

  it('lets ONE performance announce itself, the way a save from the Backoffice does', async () => {
    const { deps, created, announced } = fakeDeps()
    await createPerformancesInBulk([row('2027-05-04')], deps)

    // No skip flag, so the Shows afterChange hook sends the per-performance
    // "Nova izvedba" with its date, time and place — which is what a voditelj
    // adding one cruise call from the pier means to send (#503).
    expect(created[0]!.context[SKIP_ROSTER_PUSH]).toBeUndefined()
    // And then no summary on top of it: "dodana je 1 nova izvedba" would be the
    // same news a second time.
    expect(announced).toEqual([])
  })

  it('announces nothing for an empty batch and opens no transaction it must use', async () => {
    const { deps, created, announced } = fakeDeps()
    const res = await createPerformancesInBulk([], deps)

    expect(res.created).toEqual([])
    expect(created).toEqual([])
    expect(announced).toEqual([])
  })

  it('lets a failed write out, so the caller can roll the batch back', async () => {
    const { announced } = fakeDeps()
    const deps: BulkCreateDeps<'tx'> = {
      withTransaction: (fn) => fn('tx'),
      create: async (args) => {
        if (args.data.date === '2027-05-06') throw new Error('nope')
      },
      announce: (input) => announced.push(input),
    }

    await expect(
      createPerformancesInBulk([row('2027-05-04'), row('2027-05-06')], deps),
    ).rejects.toThrow('nope')
    expect(announced).toEqual([])
  })
})
