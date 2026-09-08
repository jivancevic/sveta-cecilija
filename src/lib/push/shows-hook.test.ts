import { describe, expect, it, vi, beforeEach } from 'vitest'

// #441 review — the hook's own two decisions: it honours the bulk-create opt-out
// and it never lets a broken dep fail a save. What it notifies ABOUT is
// `notify.test.ts`'s subject, so the notifier is a spy here.

const notifyPerformanceSaved = vi.fn(async () => ({
  kind: 'changed' as const,
  changed: [],
  claimsReleased: false,
  sending: null,
}))
const createPushDeps = vi.fn(() => ({}) as never)

vi.mock('./notify', () => ({
  notifyPerformanceSaved: (...args: unknown[]) => notifyPerformanceSaved(...(args as [])),
}))
vi.mock('./push-data', () => ({ createPushDeps: () => createPushDeps() }))

import { notifyRosterOnShowChange, SKIP_ROSTER_PUSH } from './shows-hook'

const doc = { id: 7, date: '2026-08-05', time: '21:00' }

function run(context?: Record<string, unknown>) {
  return (notifyRosterOnShowChange as unknown as (args: Record<string, unknown>) => Promise<unknown>)({
    doc,
    previousDoc: { ...doc, time: '20:00' },
    operation: 'update',
    req: { payload: {}, context },
    context,
  })
}

beforeEach(() => vi.clearAllMocks())

describe('the Shows afterChange hook', () => {
  it('notifies the roster about an ordinary save', async () => {
    await run()
    expect(notifyPerformanceSaved).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the caller set the bulk-create opt-out', async () => {
    await run({ [SKIP_ROSTER_PUSH]: true })
    expect(notifyPerformanceSaved).not.toHaveBeenCalled()
  })

  it('ignores a flag that is not exactly true', async () => {
    await run({ [SKIP_ROSTER_PUSH]: 'yes' })
    expect(notifyPerformanceSaved).toHaveBeenCalledTimes(1)
  })

  it('returns the document even when the deps cannot be built', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    createPushDeps.mockImplementationOnce(() => {
      throw new Error('No Postgres pool on the Payload instance')
    })
    await expect(run()).resolves.toBe(doc)
    spy.mockRestore()
  })
})
