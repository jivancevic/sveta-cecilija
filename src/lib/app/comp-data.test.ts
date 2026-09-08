import { describe, expect, it } from 'vitest'
import { issueSelfComp, type CompPayload } from './comp-data'
import { sendOrderTicketEmail } from '@/lib/email/send-order-ticket-email'
import type { SendTicketEmailInput } from '@/lib/email/send-ticket-email'

// #434 — the wiring half: a self-issued comp really does go out through the
// EXISTING ticket email, with the comp PDF, and a letter that never leaves does
// not take the tickets with it.
//
// The fake Payload below is a tiny in-memory store rather than a mock of the
// call sequence: the assertions are on what the ticket sender was handed (a
// free PDF, one slip per person, the dancer's address), which is the observable
// behaviour a dancer's inbox depends on.

const SHOW = {
  id: 10,
  // Far enough ahead that the engine's upcoming-show guard is never the
  // reason a case fails.
  date: '2099-08-20T00:00:00.000Z',
  time: '21:00',
  venue: 'ljetno-kino',
  status: 'active',
  isPublic: true,
  inPersonSold: 0,
  legacyReserved: 0,
}

function fakePayload() {
  const orders: Record<string, Record<string, unknown>> = {}
  const tickets: Record<string, unknown>[] = []
  let nextOrder = 900
  let nextTicket = 1

  const payload = {
    db: {
      pool: {
        // The active-ticket count for the capacity guard.
        query: async () => ({ rows: [{ sold: 0 }] }),
        // The advisory lock takes its own connection.
        connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
      },
    },
    findByID: async ({ collection, id }: { collection: string; id: unknown }) => {
      if (collection === 'shows') return { ...SHOW }
      if (collection === 'orders') {
        const order = orders[String(id)]
        // depth 1: the ticket email reads the show off the order.
        return order ? { ...order, show: { ...SHOW } } : null
      }
      return null
    },
    find: async ({ collection }: { collection: string }) => {
      if (collection === 'orders') return { docs: [] } // every generated code is unique
      if (collection === 'tickets') return { docs: tickets }
      return { docs: [] }
    },
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      if (collection === 'orders') {
        const id = nextOrder++
        orders[String(id)] = { ...data, id }
        return { id }
      }
      const id = nextTicket++
      tickets.push({ ...data, id })
      return { id }
    },
  }

  return { payload: payload as unknown as CompPayload, orders, tickets }
}

const args = {
  memberId: '7',
  performanceId: '10',
  adults: 1,
  children: 1,
  buyerName: 'Marija Fabris',
  email: 'ana@example.com',
  guard: async () => {},
}

/** The real sender, with its Brevo call and its QR renderer replaced. */
function withFakeSender(
  outcome: boolean,
  seen: SendTicketEmailInput[],
): NonNullable<Parameters<typeof issueSelfComp>[2]>['sendEmail'] {
  return (payload, orderId) =>
    sendOrderTicketEmail(payload, orderId, {
      brevoApiKey: 'test-key',
      generateQrPng: async () => Buffer.from('png'),
      sendTicketEmail: async (input) => {
        seen.push(input)
        return outcome
      },
    })
}

describe('issueSelfComp', () => {
  it('mails the comp through the existing ticket email, with a free PDF', async () => {
    const { payload, orders, tickets } = fakePayload()
    const seen: SendTicketEmailInput[] = []

    const result = await issueSelfComp(payload, args, { sendEmail: withFakeSender(true, seen) })

    expect(result).toMatchObject({ ok: true, ticketCount: 2, emailStatus: 'sent' })
    // The order is a comp attributed to the dancer, marked as self-issued.
    expect(Object.values(orders)[0]).toMatchObject({
      channel: 'comp',
      compIssuedBy: 'self',
      member: 7,
      total: 0,
      buyerName: 'Marija Fabris',
      email: 'ana@example.com',
      locale: 'hr',
    })
    // One ticket row per person, one adult and one child.
    expect(tickets).toHaveLength(2)
    expect(tickets.map((t) => t.type)).toEqual(['adult', 'child'])

    const letter = seen[0]!
    expect(letter.buyer.email).toBe('ana@example.com')
    expect(letter.pdf?.free).toBe(true) // "Complimentary", no price on the slip
    expect(letter.locale).toBe('hr')
    expect(letter.tickets).toHaveLength(2)
    expect(letter.tickets.map((t) => t.ref)).toEqual([
      `${letter.orderCode}-1`,
      `${letter.orderCode}-2`,
    ])
  })

  it('keeps the comps when the letter does not leave, and says so', async () => {
    const { payload, tickets } = fakePayload()
    const seen: SendTicketEmailInput[] = []

    const result = await issueSelfComp(payload, args, { sendEmail: withFakeSender(false, seen) })

    // The tickets are already committed: a Brevo refusal is a status to report,
    // never a rollback (the same contract the admin comp route relies on).
    expect(result).toMatchObject({ ok: true, emailStatus: 'failed' })
    expect(tickets).toHaveLength(2)
  })

  it('reports the cap without writing anything when the guard refuses', async () => {
    const { payload, orders, tickets } = fakePayload()
    const { SelfCompCapError } = await import('@/lib/comp/self-comp')

    const result = await issueSelfComp(
      payload,
      {
        ...args,
        guard: async () => {
          throw new SelfCompCapError()
        },
      },
      { sendEmail: async () => ({ status: 'sent', email: null }) },
    )

    expect(result).toEqual({ ok: false, reason: 'cap' })
    expect(Object.keys(orders)).toHaveLength(0)
    expect(tickets).toHaveLength(0)
  })
})
