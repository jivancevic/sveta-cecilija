import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyStaffOfDispute, notifyStaffOfEnquiry } from './staff-notifications'

// The two kinds that are filed and never pushed. What matters here is that the
// audience is `tickets` (nobody else), that the row says enough to act on
// without opening anything, and that a failure is swallowed — an enquiry is
// already stored and a chargeback's money has already moved by the time these
// run.

function fakeQuery(staff: number[] = [4, 12]) {
  const calls: { sql: string; params: unknown[] }[] = []
  const query = async (sql: string, params?: unknown[]) => {
    const flat = sql.replace(/\s+/g, ' ').trim()
    calls.push({ sql: flat, params: params ?? [] })
    if (flat.startsWith('SELECT DISTINCT')) return { rows: staff.map((id) => ({ parent_id: id })) }
    return { rows: staff.map((id) => ({ id })), rowCount: staff.length }
  }
  return { query, calls }
}

const insert = (calls: { sql: string; params: unknown[] }[]) =>
  calls.find((c) => c.sql.startsWith('INSERT INTO app_notifications'))

afterEach(() => vi.restoreAllMocks())

describe('notifyStaffOfEnquiry', () => {
  it('files one row per tickets holder, naming who wrote and about what', async () => {
    const { query, calls } = fakeQuery()
    expect(await notifyStaffOfEnquiry(query, { name: ' Ana Horvat ', enquiryType: 'private-moreska' })).toBe(2)

    const row = insert(calls)!
    expect(row.params[0]).toEqual([4, 12])
    expect(row.params[1]).toBe('inquiry')
    expect(row.params[2]).toBe('Novi upit')
    expect(row.params[3]).toBe('Ana Horvat · Privatna moreška')
    expect(row.params[4]).toBe('/app/inquiries')
  })

  it('writes nothing when nobody holds tickets', async () => {
    const { query, calls } = fakeQuery([])
    expect(await notifyStaffOfEnquiry(query, { name: 'Ana', enquiryType: 'general' })).toBe(0)
    expect(insert(calls)).toBeUndefined()
  })
})

describe('notifyStaffOfDispute', () => {
  it('names the order, the money and the reason', async () => {
    const { query, calls } = fakeQuery([4])
    await notifyStaffOfDispute(query, {
      orderCode: 'MOR-1234',
      amountCents: 12000,
      currency: 'eur',
      reason: 'product_not_received',
    })

    const row = insert(calls)!
    expect(row.params[1]).toBe('dispute')
    expect(row.params[2]).toBe('Osporena naplata')
    expect(String(row.params[3])).toContain('Narudžba MOR-1234')
    expect(String(row.params[3])).toContain('EUR')
    expect(String(row.params[3])).toContain('product_not_received')
    expect(row.params[4]).toBe('/app/orders')
  })

  it('says so when Stripe matched no order', async () => {
    const { query, calls } = fakeQuery([4])
    await notifyStaffOfDispute(query, {
      orderCode: null,
      amountCents: 2000,
      currency: 'eur',
      reason: 'fraudulent',
    })
    expect(String(insert(calls)!.params[3])).toContain('Nije pronađena narudžba')
  })

  it('swallows a database that is not there', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const query = async () => {
      throw new Error('no pool')
    }
    await expect(
      notifyStaffOfDispute(query, {
        orderCode: null,
        amountCents: 0,
        currency: 'eur',
        reason: 'unknown',
      }),
    ).resolves.toBe(0)
  })
})
