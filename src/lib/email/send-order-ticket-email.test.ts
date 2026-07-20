import { describe, it, expect, vi } from 'vitest'
import {
  sendOrderTicketEmail,
  type OrderEmailPayload,
} from './send-order-ticket-email'

// A fake Payload local-API slice. `order` is the doc returned by findByID;
// `tickets` are the rows returned by find.
function makePayload(
  order: Record<string, unknown> | null,
  tickets: Record<string, unknown>[] = [],
): OrderEmailPayload {
  return {
    findByID: vi.fn().mockResolvedValue(order),
    find: vi.fn().mockResolvedValue({ docs: tickets }),
  }
}

const baseOrder = {
  id: 42,
  code: 'AB23',
  email: 'guest@example.com',
  buyerName: 'Ana Anić',
  channel: 'comp',
  locale: 'en',
  adultCount: 2,
  childCount: 1,
  total: 0,
  show: { date: '2026-07-15T00:00:00.000Z', time: '21:00', venue: 'ljetno-kino' },
}

const baseTickets = [
  { token: 'tok_1', type: 'adult' },
  { token: 'tok_2', type: 'adult' },
  { token: 'tok_3', type: 'child' },
]

function okSend() {
  return vi.fn().mockResolvedValue(true)
}

describe('sendOrderTicketEmail', () => {
  it('returns skipped when the order has no email (never sends)', async () => {
    const send = okSend()
    const res = await sendOrderTicketEmail(
      makePayload({ ...baseOrder, email: '' }, baseTickets),
      42,
      { brevoApiKey: 'k', sendTicketEmail: send },
    )
    expect(res).toEqual({ status: 'skipped', email: null })
    expect(send).not.toHaveBeenCalled()
  })

  it('returns skipped when the order does not exist', async () => {
    const send = okSend()
    const res = await sendOrderTicketEmail(makePayload(null), 999, {
      brevoApiKey: 'k',
      sendTicketEmail: send,
    })
    expect(res).toEqual({ status: 'skipped', email: null })
    expect(send).not.toHaveBeenCalled()
  })

  it('sends the ticket email and returns sent with the recipient', async () => {
    const send = okSend()
    const res = await sendOrderTicketEmail(makePayload(baseOrder, baseTickets), 42, {
      brevoApiKey: 'k',
      sendTicketEmail: send,
    })
    expect(res).toEqual({ status: 'sent', email: 'guest@example.com' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('derives CODE-N refs in issuance order and slices the show date', async () => {
    const send = okSend()
    await sendOrderTicketEmail(makePayload(baseOrder, baseTickets), 42, {
      brevoApiKey: 'k',
      sendTicketEmail: send,
    })
    const input = send.mock.calls[0][0]
    expect(input.tickets.map((t: { ref: string }) => t.ref)).toEqual([
      'AB23-1',
      'AB23-2',
      'AB23-3',
    ])
    expect(input.show.date).toBe('2026-07-15')
    expect(input.orderCode).toBe('AB23')
  })

  it('marks a comp slip free (Complimentary, no price)', async () => {
    const send = okSend()
    await sendOrderTicketEmail(makePayload(baseOrder, baseTickets), 42, {
      brevoApiKey: 'k',
      sendTicketEmail: send,
    })
    expect(send.mock.calls[0][0].pdf).toMatchObject({ free: true, showClaimPrompt: false })
  })

  it('carries the SOLD BY seller for a partner order and is not free', async () => {
    const send = okSend()
    const partnerOrder = {
      ...baseOrder,
      channel: 'partner',
      partner: { id: 7, name: 'Kaleta Travel' },
    }
    await sendOrderTicketEmail(makePayload(partnerOrder, baseTickets), 42, {
      brevoApiKey: 'k',
      sendTicketEmail: send,
    })
    expect(send.mock.calls[0][0].pdf).toMatchObject({
      free: false,
      seller: { name: 'Kaleta Travel' },
    })
  })

  it('honours the order locale for the email body', async () => {
    const send = okSend()
    await sendOrderTicketEmail(
      makePayload({ ...baseOrder, locale: 'hr' }, baseTickets),
      42,
      { brevoApiKey: 'k', sendTicketEmail: send },
    )
    expect(send.mock.calls[0][0].locale).toBe('hr')
  })

  it('returns failed when the order has no show', async () => {
    const send = okSend()
    const res = await sendOrderTicketEmail(
      makePayload({ ...baseOrder, show: null }, baseTickets),
      42,
      { brevoApiKey: 'k', sendTicketEmail: send },
    )
    expect(res).toEqual({ status: 'failed', email: 'guest@example.com' })
    expect(send).not.toHaveBeenCalled()
  })

  it('returns failed when the order has no tickets', async () => {
    const send = okSend()
    const res = await sendOrderTicketEmail(makePayload(baseOrder, []), 42, {
      brevoApiKey: 'k',
      sendTicketEmail: send,
    })
    expect(res).toEqual({ status: 'failed', email: 'guest@example.com' })
    expect(send).not.toHaveBeenCalled()
  })

  it('returns failed when no Brevo key is configured', async () => {
    const send = okSend()
    const res = await sendOrderTicketEmail(makePayload(baseOrder, baseTickets), 42, {
      brevoApiKey: '',
      sendTicketEmail: send,
    })
    expect(res).toEqual({ status: 'failed', email: 'guest@example.com' })
    expect(send).not.toHaveBeenCalled()
  })

  it('returns failed when the underlying send reports failure', async () => {
    const send = vi.fn().mockResolvedValue(false)
    const res = await sendOrderTicketEmail(makePayload(baseOrder, baseTickets), 42, {
      brevoApiKey: 'k',
      sendTicketEmail: send,
    })
    expect(res).toEqual({ status: 'failed', email: 'guest@example.com' })
  })
})
