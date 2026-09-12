import { describe, expect, it, vi } from 'vitest'
import { notifyPerformanceSaved } from './notify'
import type { NotifyDeps } from './notify'

// #442 review — confirming a postava must ring NOBODY.
//
// The confirm route saves through the Shows collection on purpose (so the row
// goes through Payload's hooks and validation like every other write), which
// means the roster `afterChange` hook fires on every Potvrdi and every
// Otključaj. That it sends nothing is a real decision, not an accident of the
// current diff: a dancer's phone is for "the pier moved", not for the voditelj
// ticking a box. #430 lists five notification types and a lineup is in none of
// them; the follow-up ticket for "postava objavljena" will add a SIXTH type
// deliberately rather than let this one leak out.
//
// So it is asserted here, on the real notifier over a fake sender: no message,
// no recipient lookup, and no scheduled claim handed back.

function deps(): NotifyDeps & {
  send: ReturnType<typeof vi.fn>
  release: ReturnType<typeof vi.fn>
  loadMoreskanti: ReturnType<typeof vi.fn>
} {
  const send = vi.fn(async () => ({ delivered: 0, dead: 0 }))
  const release = vi.fn(async () => {})
  // One real dancer with a login, so the "a real change still notifies" case
  // has somebody to reach; the quiet cases assert this is never even called.
  const loadMoreskanti = vi.fn(async () => [
    {
      id: '1',
      nickname: 'Cici',
      roles: ['crni', 'crni_kralj'],
      primaryRole: 'crni_kralj',
      active: true,
      isMoreskant: true,
    },
  ])
  return {
    send,
    release,
    loadMoreskanti,
    loadAttendance: vi.fn(async () => []),
    loadUserIdsByMember: vi.fn(async () => new Map<string, string>([['1', '11']])),
    loadVoditeljUserIds: vi.fn(async () => ['1']),
    now: () => new Date('2026-08-01T10:00:00.000Z'),
  } as never
}

/** A performance far enough ahead that the "only future ones" rule cannot mask the result. */
const base = {
  id: 7,
  date: '2026-08-05T12:00:00.000Z',
  time: '21:00',
  kind: 'redovna',
  isPublic: true,
  venue: 'ljetno-kino',
  status: 'active',
  voditeljNote: 'nađemo se na molu u 9:30',
  lineupConfirmed: false,
  lineupConfirmedAt: null,
}

describe('confirming a postava notifies nobody', () => {
  it.each([
    [
      'Potvrdi',
      { lineupConfirmed: true, lineupConfirmedAt: '2026-08-04T19:00:00.000Z' },
    ],
    ['Otključaj', { lineupConfirmed: false, lineupConfirmedAt: null }],
  ])('%s sends no push and releases no claim', async (_label, patch) => {
    const d = deps()
    const outcome = await notifyPerformanceSaved(
      { doc: { ...base, ...patch }, previousDoc: { ...base }, operation: 'update' },
      d,
    )

    expect(outcome.kind).toBe('none')
    expect(outcome.changed).toEqual([])
    expect(outcome.claimsReleased).toBe(false)
    expect(outcome.sending).toBeNull()
    expect(d.send).not.toHaveBeenCalled()
    expect(d.release).not.toHaveBeenCalled()
    // Not even the recipient lookup runs: nothing to decide means nothing to load.
    expect(d.loadMoreskanti).not.toHaveBeenCalled()
  })

  it('still notifies when a real change rides along with the confirmation', async () => {
    // The guard against over-fitting: the hook is quiet because the DIFF is
    // empty, not because it ignores saves that touch the lineup columns.
    const d = deps()
    const outcome = await notifyPerformanceSaved(
      {
        doc: { ...base, lineupConfirmed: true, time: '20:00' },
        previousDoc: { ...base },
        operation: 'update',
      },
      d,
    )
    expect(outcome.kind).toBe('changed')
    expect(outcome.changed).toContain('time')
    await outcome.sending
    expect(d.send).toHaveBeenCalled()
  })
})
