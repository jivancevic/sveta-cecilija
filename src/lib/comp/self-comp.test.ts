import { describe, expect, it } from 'vitest'
import type { AppRequestMeta } from '@/lib/app/request-guard'
import { APP_STRINGS } from '@/lib/app/strings'
import {
  SELF_COMP_CAP,
  SelfCompCapError,
  handleSelfCompCancel,
  handleSelfCompIssue,
  normaliseHolderName,
  selfCompCapExceeded,
  selfCompRemaining,
  type SelfCompActor,
  type SelfCompCancelContext,
  type SelfCompIssueDeps,
  type SelfCompCancelDeps,
  type SelfCompOrder,
  type SelfCompPerformance,
} from './self-comp'

// #434 — a moreškant's own comps, driven from outside: the status and body of
// each handler, and what the deps were asked to do. The permission gate is the
// route's (`requirePermission(req, 'moreskant')`); what these tests own is who
// may issue, how many, when, and whose order may be cancelled.

const sameOrigin: AppRequestMeta = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const actor: SelfCompActor = { memberId: '7', name: 'Ana Marić', email: 'ana@example.com' }

// 2026-07-10 21:30 Europe/Zagreb = 19:30 UTC.
const NOW = Date.parse('2026-07-10T12:00:00Z')

const upcoming: SelfCompPerformance = {
  id: '10',
  date: '2026-07-10',
  time: '21:30',
  cancelled: false,
  isPublic: true,
}

type IssueCall = Parameters<SelfCompIssueDeps['issue']>[0]

function issueDeps(
  overrides: Partial<SelfCompIssueDeps> = {},
  calls: IssueCall[] = [],
): SelfCompIssueDeps {
  return {
    request: sameOrigin,
    actor,
    loadPerformance: async () => upcoming,
    countOwnSelfComps: async () => 0,
    issue: async (args) => {
      calls.push(args)
      await args.guard()
      return { ok: true, orderId: '55', code: 'MK-1234', ticketCount: args.adults + args.children, emailStatus: 'sent' }
    },
    now: () => new Date(NOW),
    ...overrides,
  }
}

describe('the cap arithmetic', () => {
  it('leaves four for a dancer who has issued nothing', () => {
    expect(selfCompRemaining(0)).toBe(SELF_COMP_CAP)
    expect(selfCompRemaining(3)).toBe(1)
  })

  it('never goes negative, whatever the count says', () => {
    expect(selfCompRemaining(9)).toBe(0)
  })

  it('refuses only what would cross four', () => {
    expect(selfCompCapExceeded(0, 4)).toBe(false)
    expect(selfCompCapExceeded(3, 1)).toBe(false)
    expect(selfCompCapExceeded(3, 2)).toBe(true)
    expect(selfCompCapExceeded(4, 1)).toBe(true)
  })
})

describe('the holder name', () => {
  it('falls back to the Member name and trims the input', () => {
    expect(normaliseHolderName('  Marija  ', 'Ana Marić')).toBe('Marija')
    expect(normaliseHolderName('   ', 'Ana Marić')).toBe('Ana Marić')
    expect(normaliseHolderName(undefined, null)).toBeNull()
  })

  it('trims an over-long name rather than refusing the comp', () => {
    expect(normaliseHolderName('x'.repeat(200), null)).toHaveLength(80)
  })
})

describe('POST /api/app/comp/issue', () => {
  it('issues, and reports the code and the mail status', async () => {
    const calls: IssueCall[] = []
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 2, children: 1, buyerName: 'Marija' },
      issueDeps({}, calls),
    )
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ ok: true, code: 'MK-1234', ticketCount: 3, emailStatus: 'sent' })
    expect(calls[0]).toMatchObject({
      performanceId: '10',
      adults: 2,
      children: 1,
      buyerName: 'Marija',
      email: 'ana@example.com',
    })
  })

  it('defaults the printed name to the dancer own name', async () => {
    const calls: IssueCall[] = []
    await handleSelfCompIssue({ performanceId: '10', adults: 1, children: 0 }, issueDeps({}, calls))
    expect(calls[0]?.buyerName).toBe('Ana Marić')
  })

  it('refuses a cross-site POST before it reads anything', async () => {
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 1, children: 0 },
      issueDeps({ request: { ...sameOrigin, secFetchSite: 'cross-site' } }),
    )
    expect(result.status).toBe(403)
  })

  it('refuses a non-JSON body with 415', async () => {
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 1, children: 0 },
      issueDeps({ request: { ...sameOrigin, contentType: 'text/plain' } }),
    )
    expect(result.status).toBe(415)
  })

  it('refuses a login with no Member link (story 55)', async () => {
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 1, children: 0 },
      issueDeps({ actor: null }),
    )
    expect(result.status).toBe(403)
    expect(result.body.error).toBe(APP_STRINGS.comp.noMember)
  })

  it('refuses a Member with no e-mail, naming the thing to fix', async () => {
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 1, children: 0 },
      issueDeps({ actor: { ...actor, email: null } }),
    )
    expect(result.status).toBe(400)
    expect(result.body.error).toBe(APP_STRINGS.comp.noEmail)
  })

  it('refuses an empty request', async () => {
    const result = await handleSelfCompIssue({ performanceId: '10', adults: 0, children: 0 }, issueDeps())
    expect(result.status).toBe(400)
    expect(result.body.error).toBe(APP_STRINGS.comp.pickOne)
  })

  it('refuses a non-public performance', async () => {
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 1, children: 0 },
      issueDeps({ loadPerformance: async () => ({ ...upcoming, isPublic: false }) }),
    )
    expect(result.status).toBe(400)
    expect(result.body.error).toBe(APP_STRINGS.comp.notPublic)
  })

  it('refuses a cancelled performance', async () => {
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 1, children: 0 },
      issueDeps({ loadPerformance: async () => ({ ...upcoming, cancelled: true }) }),
    )
    expect(result.status).toBe(400)
    expect(result.body.error).toBe(APP_STRINGS.comp.showCancelled)
  })

  it('refuses a performance that has already started', async () => {
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 1, children: 0 },
      issueDeps({ now: () => new Date(Date.parse('2026-07-10T20:00:00Z')) }),
    )
    expect(result.status).toBe(409)
    expect(result.body.error).toBe(APP_STRINGS.comp.started)
  })

  it('refuses more than four in one request without touching the engine', async () => {
    const calls: IssueCall[] = []
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 3, children: 3 },
      issueDeps({}, calls),
    )
    expect(result.status).toBe(409)
    expect(result.body.error).toBe(APP_STRINGS.comp.capReached)
    expect(calls).toHaveLength(0)
  })

  it('refuses a single field above the cap with the cap sentence, not "pick one"', async () => {
    const calls: IssueCall[] = []
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 5, children: 0 },
      issueDeps({}, calls),
    )
    expect(result.status).toBe(409)
    expect(result.body.error).toBe(APP_STRINGS.comp.capReached)
    expect(calls).toHaveLength(0)
  })

  it('refuses a nonsense count as a bad request', async () => {
    const calls: IssueCall[] = []
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: -1, children: 'two' },
      issueDeps({}, calls),
    )
    expect(result.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('refuses a request that would cross the cap, counted inside the lock', async () => {
    // The engine calls `guard` where the seat lock is held; the cap error it
    // throws is what the route maps to `reason: 'cap'`.
    const deps = issueDeps({
      countOwnSelfComps: async () => 3,
      issue: async (args) => {
        try {
          await args.guard()
        } catch (err) {
          if (err instanceof SelfCompCapError) return { ok: false, reason: 'cap' }
          throw err
        }
        return { ok: true, orderId: '1', code: 'X', ticketCount: 1, emailStatus: 'sent' }
      },
    })
    const result = await handleSelfCompIssue({ performanceId: '10', adults: 2, children: 0 }, deps)
    expect(result.status).toBe(409)
    expect(result.body.error).toBe(APP_STRINGS.comp.capReached)
  })

  it('lets the fourth ticket through when three are already out', async () => {
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 1, children: 0 },
      issueDeps({ countOwnSelfComps: async () => 3 }),
    )
    expect(result.status).toBe(200)
  })

  it('serialises two taps: the second sees the first tally and is refused', async () => {
    // One shared tally behind a one-at-a-time "lock", the way the real route
    // wires `guard` inside `withShowSellLock`.
    let issued = 0
    let chain: Promise<unknown> = Promise.resolve()
    const deps = issueDeps({
      countOwnSelfComps: async () => issued,
      issue: async (args) => {
        const run = chain.then(async () => {
          try {
            await args.guard()
          } catch (err) {
            if (err instanceof SelfCompCapError) return { ok: false as const, reason: 'cap' as const }
            throw err
          }
          issued += args.adults + args.children
          return {
            ok: true as const,
            orderId: String(issued),
            code: 'MK',
            ticketCount: args.adults + args.children,
            emailStatus: 'sent',
          }
        })
        chain = run.catch(() => undefined)
        return run
      },
    })
    const body = { performanceId: '10', adults: 3, children: 0 }
    const [first, second] = await Promise.all([
      handleSelfCompIssue(body, deps),
      handleSelfCompIssue(body, deps),
    ])
    expect([first.status, second.status].sort()).toEqual([200, 409])
    expect(issued).toBe(3)
  })

  it('turns an oversell into "nema mjesta", not a 500', async () => {
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 1, children: 0 },
      issueDeps({ issue: async () => ({ ok: false, reason: 'oversell' }) }),
    )
    expect(result.status).toBe(409)
    expect(result.body.error).toBe(APP_STRINGS.comp.soldOut)
  })

  it('still answers 200 when the e-mail did not leave', async () => {
    const result = await handleSelfCompIssue(
      { performanceId: '10', adults: 1, children: 0 },
      issueDeps({
        issue: async () => ({
          ok: true,
          orderId: '1',
          code: 'MK-9',
          ticketCount: 1,
          emailStatus: 'failed',
        }),
      }),
    )
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ ok: true, emailStatus: 'failed' })
  })
})

const ownOrder: SelfCompOrder = {
  id: '55',
  channel: 'comp',
  compIssuedBy: 'self',
  memberId: '7',
}

const context: SelfCompCancelContext = { anyScanned: false, performance: upcoming }

function cancelDeps(overrides: Partial<SelfCompCancelDeps> = {}): SelfCompCancelDeps {
  return {
    request: sameOrigin,
    actor,
    loadOrder: async () => ownOrder,
    loadCancelContext: async () => context,
    voidOrder: async () => 2,
    now: () => new Date(NOW),
    ...overrides,
  }
}

describe('POST /api/app/comp/cancel', () => {
  it('voids the whole order and says how many went', async () => {
    const result = await handleSelfCompCancel({ orderId: '55' }, cancelDeps())
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ ok: true, voided: 2 })
  })

  it('refuses a login with no Member link', async () => {
    const result = await handleSelfCompCancel({ orderId: '55' }, cancelDeps({ actor: null }))
    expect(result.status).toBe(403)
  })

  // The oracle test: four different orders, ONE answer, so walking the ids
  // tells a dancer nothing about what exists, what is a comp or whose it is.
  const foreign: Record<string, SelfCompOrder | null> = {
    'no such order': null,
    'a paid online order': { ...ownOrder, channel: 'online', compIssuedBy: null },
    "an admin's comp for the same member": { ...ownOrder, compIssuedBy: 'admin' },
    "another dancer's self-issued comp": { ...ownOrder, memberId: '8' },
  }
  for (const [label, order] of Object.entries(foreign)) {
    it(`answers one plain 404 for ${label}`, async () => {
      const result = await handleSelfCompCancel(
        { orderId: '55' },
        cancelDeps({ loadOrder: async () => order }),
      )
      expect(result.status).toBe(404)
      expect(result.body.error).toBe(APP_STRINGS.comp.notFound)
    })
  }

  it('never reads the tickets or the evening of an order that is not the caller own', async () => {
    let context = 0
    await handleSelfCompCancel(
      { orderId: '55' },
      cancelDeps({
        loadOrder: async () => ({ ...ownOrder, memberId: '8' }),
        loadCancelContext: async () => {
          context += 1
          return { anyScanned: false, performance: upcoming }
        },
      }),
    )
    expect(context).toBe(0)
  })

  it('refuses rather than voids when the evening cannot be read', async () => {
    let voided = 0
    const result = await handleSelfCompCancel(
      { orderId: '55' },
      cancelDeps({
        loadCancelContext: async () => ({ anyScanned: false, performance: null }),
        voidOrder: async () => {
          voided += 1
          return 1
        },
      }),
    )
    expect(result.status).toBe(409)
    expect(voided).toBe(0)
  })

  it('still gives the tickets back on an evening that was cancelled', async () => {
    const result = await handleSelfCompCancel(
      { orderId: '55' },
      cancelDeps({
        loadCancelContext: async () => ({
          anyScanned: false,
          performance: { ...upcoming, cancelled: true },
        }),
      }),
    )
    expect(result.status).toBe(200)
  })

  it('refuses once a ticket has been scanned', async () => {
    const result = await handleSelfCompCancel(
      { orderId: '55' },
      cancelDeps({ loadCancelContext: async () => ({ ...context, anyScanned: true }) }),
    )
    expect(result.status).toBe(409)
    expect(result.body.error).toBe(APP_STRINGS.comp.scanned)
  })

  it('refuses once the performance has started', async () => {
    const result = await handleSelfCompCancel(
      { orderId: '55' },
      cancelDeps({ now: () => new Date(Date.parse('2026-07-10T20:00:00Z')) }),
    )
    expect(result.status).toBe(409)
    expect(result.body.error).toBe(APP_STRINGS.comp.started)
  })

  it('409s a second cancel, which voided nothing', async () => {
    const result = await handleSelfCompCancel({ orderId: '55' }, cancelDeps({ voidOrder: async () => 0 }))
    expect(result.status).toBe(409)
  })

  it('never voids without the guard passing', async () => {
    let voided = 0
    await handleSelfCompCancel(
      { orderId: '55' },
      cancelDeps({
        request: { ...sameOrigin, contentType: 'text/plain' },
        voidOrder: async () => {
          voided += 1
          return 1
        },
      }),
    )
    expect(voided).toBe(0)
  })
})
