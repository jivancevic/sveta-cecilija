import { describe, expect, it } from 'vitest'
import { NO_DEVICE_SIGNAL, type DeviceSignal } from './device'
import {
  everSignedIn,
  isMissing,
  MEMBER_FILTERS,
  memberAccess,
  memberFilterCounts,
  memberMatchesFilter,
  type MemberAccountSignal,
} from './member-marks'

// The three marks and the four chips of Članovi (#653, ADR-0028), decided with
// no database: every row here is a signal in and a row's right-hand side out.

function device(over: Partial<DeviceSignal> = {}): DeviceSignal {
  return { ...NO_DEVICE_SIGNAL, ...over }
}

function signal(over: Partial<MemberAccountSignal> = {}): MemberAccountSignal {
  return { sessions: 0, device: device(), hasEmail: false, ...over }
}

describe('everSignedIn', () => {
  it('is false for a Member no login points at', () => {
    expect(everSignedIn(null)).toBe(false)
    expect(everSignedIn(undefined)).toBe(false)
  })

  it('is false for an account that exists and was never opened', () => {
    expect(everSignedIn(signal())).toBe(false)
  })

  it('is true on a session row, which is the retroactive half', () => {
    expect(everSignedIn(signal({ sessions: 1 }))).toBe(true)
  })

  it('is true on a device row, which survives an "Odjava" the session does not', () => {
    expect(everSignedIn(signal({ sessions: 0, device: device({ devices: 1 }) }))).toBe(true)
  })

  it('is NOT inferred from a push subscription alone', () => {
    // `push_subscriptions` can outlive the account's own trace; a row there is
    // a fact about a browser's permission, not proof of a sign-in we recorded.
    expect(everSignedIn(signal({ device: device({ pushDevices: 3 }) }))).toBe(false)
  })
})

describe('memberAccess', () => {
  it('gives a dancer who has never been in no marks at all', () => {
    expect(memberAccess(null)).toEqual({ kind: 'never-in' })
    expect(memberAccess(signal({ hasEmail: true }))).toEqual({ kind: 'never-in' })
  })

  it('reads installed as "ne znam" until one of their devices reports', () => {
    const access = memberAccess(signal({ sessions: 1 }))
    expect(access).toEqual({
      kind: 'marks',
      installed: 'unknown',
      notifications: 'no',
      access: 'no',
    })
  })

  it('reads installed as yes once any device of theirs has reported one', () => {
    const access = memberAccess(
      signal({ sessions: 1, device: device({ devices: 2, standaloneDevices: 1 }) }),
    )
    expect(access).toMatchObject({ installed: 'yes' })
  })

  it('reads installed as no when every device of theirs reported a plain tab', () => {
    const access = memberAccess(signal({ sessions: 1, device: device({ devices: 2 }) }))
    expect(access).toMatchObject({ installed: 'no' })
  })

  it('rings on a live push subscription, on any of their devices', () => {
    const access = memberAccess(signal({ sessions: 1, device: device({ pushDevices: 1 }) }))
    expect(access).toMatchObject({ notifications: 'yes' })
  })

  it('reads the key off the address, which is what witnesses the one task', () => {
    expect(memberAccess(signal({ sessions: 1, hasEmail: true }))).toMatchObject({ access: 'yes' })
    expect(memberAccess(signal({ sessions: 1, hasEmail: false }))).toMatchObject({ access: 'no' })
  })

  it('never answers "ne znam" for the two columns the database always knows', () => {
    const access = memberAccess(signal({ sessions: 1 }))
    expect(access).toMatchObject({ notifications: 'no', access: 'no' })
  })
})

describe('isMissing', () => {
  const inAndSilent = memberAccess(signal({ sessions: 1 }))
  const inAndInstalled = memberAccess(
    signal({
      sessions: 1,
      device: device({ devices: 1, standaloneDevices: 1, pushDevices: 1 }),
      hasEmail: true,
    }),
  )

  it('counts a definite no', () => {
    expect(isMissing(inAndSilent, 'notifications')).toBe(true)
    expect(isMissing(inAndSilent, 'access')).toBe(true)
  })

  it('does NOT count a "ne znam", which is what keeps day one honest', () => {
    expect(isMissing(inAndSilent, 'installed')).toBe(false)
  })

  it('does not count somebody who has the thing', () => {
    for (const mark of ['installed', 'notifications', 'access'] as const) {
      expect(isMissing(inAndInstalled, mark)).toBe(false)
    }
  })

  it('counts a dancer who has never been in on all three', () => {
    for (const mark of ['installed', 'notifications', 'access'] as const) {
      expect(isMissing({ kind: 'never-in' }, mark)).toBe(true)
    }
  })
})

describe('memberMatchesFilter', () => {
  const rows: [string, ReturnType<typeof memberAccess> | null, Record<string, boolean>][] = [
    [
      'never in',
      { kind: 'never-in' },
      { all: true, 'no-app': true, 'no-push': true, 'no-access': true },
    ],
    [
      'in, nothing measured yet',
      memberAccess(signal({ sessions: 1 })),
      { all: true, 'no-app': false, 'no-push': true, 'no-access': true },
    ],
    [
      'in, a plain tab, no push, an address',
      memberAccess(signal({ sessions: 1, device: device({ devices: 1 }), hasEmail: true })),
      { all: true, 'no-app': true, 'no-push': true, 'no-access': false },
    ],
    [
      'fully set up',
      memberAccess(
        signal({
          sessions: 1,
          device: device({ devices: 1, standaloneDevices: 1, pushDevices: 1 }),
          hasEmail: true,
        }),
      ),
      { all: true, 'no-app': false, 'no-push': false, 'no-access': false },
    ],
    [
      'signal unreadable',
      null,
      { all: true, 'no-app': false, 'no-push': false, 'no-access': false },
    ],
  ]

  it.each(rows)('%s', (_label, access, expected) => {
    for (const filter of MEMBER_FILTERS) {
      expect(memberMatchesFilter(access, filter), filter).toBe(expected[filter])
    }
  })
})

describe('memberFilterCounts', () => {
  it('counts each chip over the rows it is handed, and "svi" over all of them', () => {
    const counts = memberFilterCounts([
      { access: { kind: 'never-in' } },
      { access: memberAccess(signal({ sessions: 1, hasEmail: true })) },
      {
        access: memberAccess(
          signal({
            sessions: 1,
            device: device({ devices: 1, standaloneDevices: 1, pushDevices: 1 }),
            hasEmail: true,
          }),
        ),
      },
    ])
    expect(counts).toEqual({ all: 3, 'no-app': 1, 'no-push': 2, 'no-access': 1 })
  })

  it('reads zero for the install column on day one, not "everybody"', () => {
    const fresh = Array.from({ length: 76 }, () => ({
      access: memberAccess(signal({ sessions: 1, hasEmail: true })),
    }))
    expect(memberFilterCounts(fresh)).toMatchObject({ all: 76, 'no-app': 0 })
  })
})
