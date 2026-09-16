import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttendanceMember } from '@/lib/attendance/rules'
import { APP_STRINGS } from '@/lib/app/strings'
import {
  ROSTER_MESSAGE_MAX,
  ROSTER_MESSAGE_URL,
  activeMoreskantIds,
  buildRosterMessage,
  handleRosterMessage,
  readRosterMessage,
  rosterMessageAudience,
} from './roster-message'
import type { PushMessage, SendPushResult } from './send'

// The seventh notification kind (#654, ADR-0028): a voditelj writes to the
// roster. Everything below is pure or DI'd, so "who gets it", "what is refused"
// and "what survives a push that fails" are asserted without Payload, Postgres
// or a socket.

const S = APP_STRINGS.notifications.message

function member(id: string, over: Partial<AttendanceMember> = {}): AttendanceMember {
  return { id, nickname: `M${id}`, active: true, isMoreskant: true, ...over }
}

const REQUEST = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

function deps(over: Partial<Parameters<typeof handleRosterMessage>[1]> = {}) {
  const sent: { userIds: string[]; message: PushMessage }[] = []
  const base = {
    request: REQUEST as Parameters<typeof handleRosterMessage>[1]['request'],
    loadMoreskanti: async () => [member('1'), member('2'), member('3')],
    loadUserIdsByMember: async () =>
      new Map([
        ['1', '11'],
        ['2', '22'],
      ]),
    send: async (userIds: readonly string[], message: PushMessage): Promise<SendPushResult> => {
      sent.push({ userIds: [...userIds], message })
      return { recipients: 1, devices: 2, delivered: 2, dead: 0, failed: 0 }
    },
  }
  return { deps: { ...base, ...over }, sent }
}

describe('rosterMessageAudience', () => {
  // A table over the roster: the rule is "every ACTIVE moreškant", and the
  // audience shrinks in exactly one place — a dancer with no login.
  const cases: {
    name: string
    members: AttendanceMember[]
    logins: [string, string][]
    expected: { roster: number; userIds: string[]; withoutLogin: number }
  }[] = [
    {
      name: 'every active moreškant who owns a login',
      members: [member('1'), member('2')],
      logins: [
        ['1', '11'],
        ['2', '22'],
      ],
      expected: { roster: 2, userIds: ['11', '22'], withoutLogin: 0 },
    },
    {
      name: 'counts a dancer with no login without addressing them',
      members: [member('1'), member('2'), member('3')],
      logins: [['1', '11']],
      expected: { roster: 3, userIds: ['11'], withoutLogin: 2 },
    },
    {
      name: 'drops a retired dancer',
      members: [member('1'), member('2', { active: false })],
      logins: [
        ['1', '11'],
        ['2', '22'],
      ],
      expected: { roster: 1, userIds: ['11'], withoutLogin: 0 },
    },
    {
      name: 'drops a member who is not a moreškant',
      members: [member('1'), member('9', { isMoreskant: false })],
      logins: [
        ['1', '11'],
        ['9', '99'],
      ],
      expected: { roster: 1, userIds: ['11'], withoutLogin: 0 },
    },
    {
      name: 'never addresses one account twice, whatever the roster says',
      members: [member('1'), member('1'), member('2')],
      logins: [
        ['1', '11'],
        ['2', '11'],
      ],
      expected: { roster: 2, userIds: ['11'], withoutLogin: 1 },
    },
    {
      name: 'is empty on an empty roster',
      members: [],
      logins: [],
      expected: { roster: 0, userIds: [], withoutLogin: 0 },
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      expect(rosterMessageAudience(c.members, new Map(c.logins))).toEqual(c.expected)
    })
  }

  it('hands the login lookup the same member ids it counts', () => {
    const members = [member('1'), member('2', { active: false }), member('3')]
    expect(activeMoreskantIds(members)).toEqual(['1', '3'])
  })
})

describe('readRosterMessage', () => {
  it('takes a trimmed sentence that was confirmed', () => {
    expect(readRosterMessage({ text: '  Dođite u nedjelju u 18.  ', confirmed: true })).toEqual({
      ok: true,
      text: 'Dođite u nedjelju u 18.',
    })
  })

  it('refuses an empty message', () => {
    expect(readRosterMessage({ text: '   ', confirmed: true })).toEqual({
      ok: false,
      error: S.empty,
    })
    expect(readRosterMessage(null)).toEqual({ ok: false, error: S.empty })
  })

  it('refuses a message longer than the limit', () => {
    const long = 'a'.repeat(ROSTER_MESSAGE_MAX + 1)
    expect(readRosterMessage({ text: long, confirmed: true })).toEqual({
      ok: false,
      error: S.tooLong(ROSTER_MESSAGE_MAX),
    })
  })

  // The sheet is the design, not a nicety: it is where both counts are said out
  // loud, and a caller that skipped it is a caller ringing dozens of phones
  // without a receipt.
  it('refuses a send that did not come through the confirmation sheet', () => {
    expect(readRosterMessage({ text: 'Halo' })).toEqual({ ok: false, error: S.unconfirmed })
    expect(readRosterMessage({ text: 'Halo', confirmed: 'yes' })).toEqual({
      ok: false,
      error: S.unconfirmed,
    })
  })
})

describe('buildRosterMessage', () => {
  it('carries its kind, so the push and the inbox row are one write', () => {
    const message = buildRosterMessage('Javite e-mail i lozinku.')
    expect(message.kind).toBe('message')
    expect(message.body).toBe('Javite e-mail i lozinku.')
    expect(message.title).toBe('Poruka voditelja')
    expect(message.url).toBe(ROSTER_MESSAGE_URL)
  })

  it('never collapses two messages onto one another', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-16T10:00:00Z'))
    const first = buildRosterMessage('Prva')
    vi.setSystemTime(new Date('2026-09-16T10:05:00Z'))
    const second = buildRosterMessage('Druga')
    expect(first.tag).not.toBe(second.tag)
    vi.useRealTimers()
  })
})

describe('handleRosterMessage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends to every active moreškant who owns a login', async () => {
    const { deps: d, sent } = deps()
    const result = await handleRosterMessage({ text: 'Dođite u 18.', confirmed: true }, d)

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      ok: true,
      people: 2,
      devices: 2,
      delivered: 2,
      withoutLogin: 1,
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.userIds).toEqual(['11', '22'])
    expect(sent[0]!.message.kind).toBe('message')
    expect(sent[0]!.message.body).toBe('Dođite u 18.')
  })

  it('refuses an unconfirmed or empty body before anything is loaded', async () => {
    const { deps: d, sent } = deps({
      loadMoreskanti: async () => {
        throw new Error('must not be reached')
      },
    })
    expect(await handleRosterMessage({ text: 'Halo' }, d)).toEqual({
      status: 400,
      body: { error: S.unconfirmed },
    })
    expect(sent).toEqual([])
  })

  it('says so when no active moreškant has a login at all', async () => {
    const { deps: d, sent } = deps({ loadUserIdsByMember: async () => new Map() })
    expect(await handleRosterMessage({ text: 'Halo', confirmed: true }, d)).toEqual({
      status: 409,
      body: { error: S.nobody },
    })
    expect(sent).toEqual([])
  })

  // THE regression this feature turns on (#654 acceptance): the inbox rows are
  // written inside `createSender` BEFORE a single endpoint is posted to, and
  // they are written for the whole audience. So a push half that fails in part
  // — or collapses entirely — must still leave every row, and must never be
  // reported as a failed send: a 500 here would have the voditelj write the
  // same sentence again on top of rows that already landed.
  it('reports a partial push failure as a send that reached fewer phones', async () => {
    const { deps: d } = deps({
      send: async () => ({ recipients: 1, devices: 3, delivered: 1, dead: 1, failed: 1 }),
    })
    const result = await handleRosterMessage({ text: 'Halo', confirmed: true }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, people: 2, devices: 3, delivered: 1, withoutLogin: 1 })
  })

  it('still answers ok when the push half throws, because the rows were filed first', async () => {
    const filed: string[][] = []
    const { deps: d } = deps({
      // The shape `createSender` has: file for the whole audience, then push.
      send: async (userIds) => {
        filed.push([...userIds])
        throw new Error('push service down')
      },
    })

    const result = await handleRosterMessage({ text: 'Halo', confirmed: true }, d)

    expect(filed).toEqual([['11', '22']])
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, people: 2, devices: 0, delivered: 0, withoutLogin: 1 })
  })
})

describe('the confirmation sheet copy', () => {
  it('names both numbers out loud', () => {
    expect(S.counts(43, 76)).toBe(
      'Zvonit će na 43 mobitela, a svih 76 će je naći u Sandučiću.',
    )
  })

  it('declines the phones and never says "svih 1"', () => {
    expect(S.counts(1, 1)).toBe('Zvonit će na 1 mobitel, a jedan će je naći u Sandučiću.')
    expect(S.counts(21, 5)).toBe('Zvonit će na 21 mobitel, a svih 5 će je naći u Sandučiću.')
    expect(S.counts(11, 5)).toBe('Zvonit će na 11 mobitela, a svih 5 će je naći u Sandučiću.')
    expect(S.counts(0, 76)).toBe(
      'Neće zazvoniti ni jedan mobitel, a svih 76 će je naći u Sandučiću.',
    )
  })
})
