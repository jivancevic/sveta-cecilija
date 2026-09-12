import { describe, expect, it, vi } from 'vitest'
import { MAX_BUYER_EMAIL, MAX_BUYER_NAME, handleBuyerEdit, normaliseBuyer } from './orders-buyer'
import { APP_STRINGS } from './strings'

// "Uredi kupca" (#501): the one field edit Narudžbe carries, and the only thing
// on the screen that writes to an order.
//
// Everything else about an order is decided elsewhere and must stay there: the
// counts and the total are what was paid, the channel is how it was sold, and
// the refund state belongs to the refund engine. A name typed wrong at the
// door and an address the tickets bounced off are the two a `tickets` holder
// legitimately repairs, so they are the two this handler accepts.

const meta = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

function deps(over: Record<string, unknown> = {}) {
  return {
    request: meta,
    loadOrder: vi.fn(async () => ({ refunded: false })),
    saveBuyer: vi.fn(async () => undefined),
    ...over,
  } as Parameters<typeof handleBuyerEdit>[2]
}

describe('normaliseBuyer', () => {
  it('trims the name and lowercases the address', () => {
    expect(normaliseBuyer({ buyerName: '  Ivan Horvat ', email: ' Ivan@Example.COM ' })).toEqual({
      ok: true,
      buyer: { buyerName: 'Ivan Horvat', email: 'ivan@example.com' },
    })
  })

  it('reads a blank address as "this order has none"', () => {
    expect(normaliseBuyer({ buyerName: 'Ivan', email: '   ' })).toEqual({
      ok: true,
      buyer: { buyerName: 'Ivan', email: null },
    })
    expect(normaliseBuyer({ buyerName: 'Ivan' })).toEqual({
      ok: true,
      buyer: { buyerName: 'Ivan', email: null },
    })
  })

  it('refuses an empty name: this edit repairs a name, it does not delete one', () => {
    expect(normaliseBuyer({ buyerName: '   ', email: 'a@b.com' })).toEqual({
      ok: false,
      error: APP_STRINGS.orders.edit.nameMissing,
    })
  })

  it('refuses an address that is not one', () => {
    expect(normaliseBuyer({ buyerName: 'Ivan', email: 'ivan.example.com' })).toEqual({
      ok: false,
      error: APP_STRINGS.orders.edit.emailInvalid,
    })
    expect(normaliseBuyer({ buyerName: 'Ivan', email: 'ivan@example' })).toEqual({
      ok: false,
      error: APP_STRINGS.orders.edit.emailInvalid,
    })
    expect(normaliseBuyer({ buyerName: 'Ivan', email: 'ivan horvat@example.com' })).toEqual({
      ok: false,
      error: APP_STRINGS.orders.edit.emailInvalid,
    })
  })

  it('refuses a value that is not a string at all', () => {
    expect(normaliseBuyer({ buyerName: 42 }).ok).toBe(false)
    expect(normaliseBuyer({ buyerName: 'Ivan', email: { at: 'x' } }).ok).toBe(false)
  })

  it('refuses a name or an address past the column length', () => {
    expect(normaliseBuyer({ buyerName: 'a'.repeat(MAX_BUYER_NAME + 1) }).ok).toBe(false)
    const long = `${'a'.repeat(MAX_BUYER_EMAIL)}@example.com`
    expect(normaliseBuyer({ buyerName: 'Ivan', email: long }).ok).toBe(false)
  })
})

describe('handleBuyerEdit', () => {
  it('saves the normalised buyer and answers with what it wrote', async () => {
    const d = deps()
    const result = await handleBuyerEdit('42', { buyerName: ' Ivan ', email: 'A@B.com' }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, buyerName: 'Ivan', email: 'a@b.com' })
    expect(d.saveBuyer).toHaveBeenCalledWith('42', { buyerName: 'Ivan', email: 'a@b.com' })
  })

  it('refuses a cross-site POST before it reads anything', async () => {
    const d = deps({ request: { ...meta, secFetchSite: 'cross-site' } })
    const result = await handleBuyerEdit('42', { buyerName: 'Ivan' }, d)
    expect(result.status).toBe(403)
    expect(d.loadOrder).not.toHaveBeenCalled()
    expect(d.saveBuyer).not.toHaveBeenCalled()
  })

  it('refuses a body that is not JSON', async () => {
    const d = deps({ request: { ...meta, contentType: 'text/plain' } })
    expect((await handleBuyerEdit('42', { buyerName: 'Ivan' }, d)).status).toBe(415)
    expect(d.saveBuyer).not.toHaveBeenCalled()
  })

  it('404s an order that is not there', async () => {
    const d = deps({ loadOrder: vi.fn(async () => null) })
    const result = await handleBuyerEdit('999', { buyerName: 'Ivan' }, d)
    expect(result.status).toBe(404)
    expect(d.saveBuyer).not.toHaveBeenCalled()
  })

  // A refunded order is a closed record: the money moved, the tickets are void
  // and the buyer's name on it is part of what happened. Editing it would
  // rewrite history and could re-address a refund notice at a stranger.
  it('refuses to edit a refunded order', async () => {
    const d = deps({ loadOrder: vi.fn(async () => ({ refunded: true })) })
    const result = await handleBuyerEdit('42', { buyerName: 'Ivan' }, d)
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: APP_STRINGS.orders.edit.refunded })
    expect(d.saveBuyer).not.toHaveBeenCalled()
  })

  it('400s an invalid field without touching the database', async () => {
    const d = deps()
    const result = await handleBuyerEdit('42', { buyerName: 'Ivan', email: 'nope' }, d)
    expect(result.status).toBe(400)
    expect(d.loadOrder).not.toHaveBeenCalled()
  })

  it('400s a missing order id', async () => {
    const d = deps()
    expect((await handleBuyerEdit('', { buyerName: 'Ivan' }, d)).status).toBe(400)
    expect(d.loadOrder).not.toHaveBeenCalled()
  })

  it('400s a body that is not an object', async () => {
    const d = deps()
    expect((await handleBuyerEdit('42', null, d)).status).toBe(400)
    expect(d.saveBuyer).not.toHaveBeenCalled()
  })
})
