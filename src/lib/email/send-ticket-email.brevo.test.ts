import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockAgent, fetch as undiciFetch } from 'undici'
import { sendTicketEmail, type SendTicketEmailDeps } from './send-ticket-email'
import { BREVO_EMAIL_ENDPOINT } from './post-brevo-email'
import { directionsFor } from './directions'
import { programmeUrl } from '../site-url'

/**
 * The real send path against a mocked Brevo (undici MockAgent, no network),
 * with the real e-mail renderer: what #543 adds is a block INSIDE the existing
 * message, so the count of requests Brevo sees per order must not move, and
 * the HTML that reaches Brevo must carry the new block.
 */
describe('sendTicketEmail through a mocked Brevo (#543)', () => {
  let agent: MockAgent
  let requests: { path: string; body: string }[]

  beforeEach(() => {
    agent = new MockAgent()
    agent.disableNetConnect()
    requests = []
    const endpoint = new URL(BREVO_EMAIL_ENDPOINT)
    agent
      .get(endpoint.origin)
      .intercept({ path: endpoint.pathname, method: 'POST' })
      .reply(201, (opts) => {
        requests.push({ path: opts.path, body: String(opts.body) })
        return { messageId: '<mock@brevo>' }
      })
      .persist()
  })

  afterEach(async () => {
    await agent.close()
  })

  function deps(): SendTicketEmailDeps {
    return {
      // The sender receives fetch by injection; route it through the mock agent.
      // undici's Response type is not structurally identical to the DOM one,
      // hence the cast through unknown; at runtime both are undici.
      fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
        undiciFetch(input as string, { ...(init as object), dispatcher: agent })) as unknown as typeof fetch,
      generateQrPng: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
      brevoApiKey: 'test-key',
      renderTicketsPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.3 fake')),
    }
  }

  const input = {
    orderId: '1247',
    buyer: { name: 'Ana Anić', email: 'ana@example.com' },
    show: { date: '2026-07-15', time: '21:00', venue: 'ljetno-kino' as const },
    order: { adultCount: 2, childCount: 1, total: 5000 },
    tickets: [
      { token: 'tok_1', type: 'adult' as const, ref: 'AB23-1' },
      { token: 'tok_2', type: 'adult' as const, ref: 'AB23-2' },
      { token: 'tok_3', type: 'child' as const, ref: 'AB23-3' },
    ],
    orderCode: 'AB23',
    locale: 'hr' as const,
  }

  it('sends exactly ONE e-mail per order, and that e-mail carries the directions block', async () => {
    await expect(sendTicketEmail(input, deps())).resolves.toBe(true)

    expect(requests).toHaveLength(1)
    const body = JSON.parse(requests[0].body)
    expect(body.to).toEqual([{ email: 'ana@example.com', name: 'Ana Anić' }])
    expect(body.attachment).toHaveLength(2)

    const d = directionsFor('hr', 'ljetno-kino')
    expect(body.htmlContent).toContain(d.heading)
    expect(body.htmlContent).toContain(`href="${d.mapUrl}"`)
    expect(body.htmlContent).toContain(`href="${programmeUrl()}"`)
  })

  it('sends one e-mail for the indoor venue too, with the indoor directions', async () => {
    await expect(
      sendTicketEmail({ ...input, show: { ...input.show, venue: 'zimsko-kino' } }, deps()),
    ).resolves.toBe(true)

    expect(requests).toHaveLength(1)
    const body = JSON.parse(requests[0].body)
    expect(body.htmlContent).toContain(`href="${directionsFor('hr', 'zimsko-kino').mapUrl}"`)
    expect(body.htmlContent).not.toContain(`href="${directionsFor('hr', 'ljetno-kino').mapUrl}"`)
  })
})
