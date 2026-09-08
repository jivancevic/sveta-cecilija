import { describe, expect, it } from 'vitest'
import {
  NON_PUBLIC_PERFORMANCE_WHERE,
  canEditPlacementField,
  canEditRosterField,
  canEditScheduleField,
  canReadRosterField,
  canSetPublicFlag,
  nonPublicAuthoringOverrides,
  showsCreateAccess,
  showsDeleteAccess,
  showsHiddenInAdmin,
  showsReadAccess,
  showsUpdateAccess,
} from './shows-access'
import type { PermissionUser } from './permissions'
import { PUBLIC_PERFORMANCE_WHERE } from '@/lib/show-performance'

// The four accounts the phase-2 Shows rules distinguish, plus the controls.
const developer = {
  id: '1',
  permissions: ['users', 'tickets', 'refunds', 'door', 'partner', 'season_stats', 'moreska', 'moreskant', 'dev'],
}
const ticketAdmin = { id: '2', permissions: ['tickets', 'refunds', 'door'] }
const doorAccount = { id: '3', permissions: ['door'], shared: true }
const voditelj = { id: '4', permissions: ['moreska'] }
const voditeljBackoffice = { id: '5', permissions: ['moreska', 'tickets'] }
const partner = { id: '6', permissions: ['partner'], partner: 7 }
const memberAccount = { id: '7', permissions: ['season_stats'], shared: true }
const noPermissions = { id: '8' }
const anon = null

// Every account that holds none of the three performance permissions.
const strangers: ReadonlyArray<readonly [string, PermissionUser]> = [
  ['partner', partner],
  ['member', memberAccount],
  ['no permission set', noPermissions as PermissionUser],
  ['anonymous', anon],
]

const doorAndStrangers: ReadonlyArray<readonly [string, PermissionUser]> = [
  ['door', doorAccount],
  ...strangers,
]

const publicRow = { id: 1, isPublic: true, kind: 'redovna', venue: 'ljetno-kino' }
const nonPublicRow = { id: 2, isPublic: false, kind: 'gulliver', location: 'Ljetno kino' }

describe('Shows read access', () => {
  it('a `tickets` or `moreska` holder reads every performance', () => {
    expect(showsReadAccess(ticketAdmin)).toBe(true)
    expect(showsReadAccess(voditelj)).toBe(true)
    expect(showsReadAccess(voditeljBackoffice)).toBe(true)
    expect(showsReadAccess(developer)).toBe(true)
  })

  it('the door reads public performances only, as a Where', () => {
    // A Where (not a filtered array) so the constraint also holds in the REST
    // and GraphQL APIs and in findByID.
    expect(showsReadAccess(doorAccount)).toEqual(PUBLIC_PERFORMANCE_WHERE)
  })

  it.each(strangers)('%s reads nothing', (_label, user) => {
    expect(showsReadAccess(user)).toBe(false)
  })
})

describe('Shows create access', () => {
  it('a `tickets` holder creates any performance', () => {
    expect(showsCreateAccess(ticketAdmin)).toBe(true)
    expect(showsCreateAccess(voditeljBackoffice)).toBe(true)
  })

  it('a `moreska`-only holder is constrained to non-public rows', () => {
    expect(showsCreateAccess(voditelj)).toEqual(NON_PUBLIC_PERFORMANCE_WHERE)
  })

  it.each(doorAndStrangers)('%s creates nothing', (_label, user) => {
    expect(showsCreateAccess(user)).toBe(false)
  })
})

describe('Shows update access', () => {
  it('a `tickets` holder updates any performance', () => {
    expect(showsUpdateAccess(ticketAdmin)).toBe(true)
    expect(showsUpdateAccess(developer)).toBe(true)
  })

  // A voditelj plans the roster of the WHOLE season, public shows included
  // (#404, voditelj stories 8 and 9): the row stays reachable and the
  // field-level locks decide what may actually change on it.
  it('a `moreska`-only holder reaches every row (field locks decide what changes)', () => {
    expect(showsUpdateAccess(voditelj)).toBe(true)
  })

  it.each(doorAndStrangers)('%s updates nothing', (_label, user) => {
    expect(showsUpdateAccess(user)).toBe(false)
  })
})

describe('Shows delete access', () => {
  it('a `tickets` holder deletes any performance', () => {
    expect(showsDeleteAccess(ticketAdmin)).toBe(true)
  })

  it('a `moreska`-only holder deletes non-public performances only', () => {
    expect(showsDeleteAccess(voditelj)).toEqual(NON_PUBLIC_PERFORMANCE_WHERE)
  })

  it.each(doorAndStrangers)('%s deletes nothing', (_label, user) => {
    expect(showsDeleteAccess(user)).toBe(false)
  })
})

describe('Shows admin sidebar', () => {
  it('is visible to `tickets` and to `moreska`', () => {
    expect(showsHiddenInAdmin(ticketAdmin)).toBe(false)
    expect(showsHiddenInAdmin(voditelj)).toBe(false)
  })

  it('is hidden from the door and from everyone else', () => {
    expect(showsHiddenInAdmin(doorAccount)).toBe(true)
    for (const [, user] of strangers) expect(showsHiddenInAdmin(user)).toBe(true)
  })
})

describe('the public flag', () => {
  it('is settable by `tickets` only', () => {
    expect(canSetPublicFlag(ticketAdmin)).toBe(true)
    expect(canSetPublicFlag(voditeljBackoffice)).toBe(true)
    expect(canSetPublicFlag(voditelj)).toBe(false)
    expect(canSetPublicFlag(doorAccount)).toBe(false)
    expect(canSetPublicFlag(anon)).toBe(false)
  })
})

describe('schedule and sales fields (date, time, kind, venue, status, counters)', () => {
  it('a `tickets` holder edits them on any row', () => {
    expect(canEditScheduleField(ticketAdmin, publicRow)).toBe(true)
    expect(canEditScheduleField(ticketAdmin, nonPublicRow)).toBe(true)
  })

  it('a `moreska`-only holder edits them on a non-public row', () => {
    expect(canEditScheduleField(voditelj, nonPublicRow)).toBe(true)
  })

  it('a `moreska`-only holder never edits them on a public row', () => {
    // Story 10: a voditelj must not be able to move a public show and trigger a
    // reschedule mail to 300 buyers.
    expect(canEditScheduleField(voditelj, publicRow)).toBe(false)
  })

  it('denies a `moreska`-only holder when the stored row is unknown (fail safe)', () => {
    expect(canEditScheduleField(voditelj, undefined)).toBe(false)
  })

  it('is closed to the door and to everyone else', () => {
    expect(canEditScheduleField(doorAccount, nonPublicRow)).toBe(false)
    for (const [, user] of strangers) expect(canEditScheduleField(user, nonPublicRow)).toBe(false)
  })
})

describe('roster fields (thresholds, voditelj note)', () => {
  it('are read and written by a `moreska` holder', () => {
    expect(canReadRosterField(voditelj)).toBe(true)
    expect(canEditRosterField(voditelj)).toBe(true)
    expect(canReadRosterField(voditeljBackoffice)).toBe(true)
  })

  it('are invisible to a `tickets`-only holder', () => {
    expect(canReadRosterField(ticketAdmin)).toBe(false)
    expect(canEditRosterField(ticketAdmin)).toBe(false)
  })

  it('are invisible to the door and to everyone else', () => {
    expect(canReadRosterField(doorAccount)).toBe(false)
    for (const [, user] of strangers) expect(canReadRosterField(user)).toBe(false)
  })
})

describe('placement fields (location, client)', () => {
  it('are editable by `tickets` and by `moreska`', () => {
    expect(canEditPlacementField(ticketAdmin)).toBe(true)
    expect(canEditPlacementField(voditelj)).toBe(true)
  })

  it('are not editable by the door or anyone else', () => {
    expect(canEditPlacementField(doorAccount)).toBe(false)
    for (const [, user] of strangers) expect(canEditPlacementField(user)).toBe(false)
  })
})

describe('nonPublicAuthoringOverrides', () => {
  it('forces a `moreska`-only creation non-public, whatever the form sent', () => {
    expect(
      nonPublicAuthoringOverrides(voditelj, 'create', { isPublic: true, kind: 'redovna' }),
    ).toEqual({ isPublic: false, kind: 'ostalo' })
  })

  it('keeps a kind the voditelj chose', () => {
    expect(
      nonPublicAuthoringOverrides(voditelj, 'create', { isPublic: true, kind: 'gulliver' }),
    ).toEqual({ isPublic: false })
  })

  it('adds nothing when the row is already non-public and not redovna', () => {
    expect(
      nonPublicAuthoringOverrides(voditelj, 'create', { isPublic: false, kind: 'dmc' }),
    ).toEqual({})
  })

  it('leaves a `tickets` holder alone', () => {
    expect(
      nonPublicAuthoringOverrides(ticketAdmin, 'create', { isPublic: true, kind: 'redovna' }),
    ).toEqual({})
    expect(
      nonPublicAuthoringOverrides(voditeljBackoffice, 'create', { isPublic: true, kind: 'redovna' }),
    ).toEqual({})
  })

  it('never touches an update: a voditelj noting a public show keeps it public', () => {
    expect(
      nonPublicAuthoringOverrides(voditelj, 'update', { isPublic: true, kind: 'redovna' }),
    ).toEqual({})
  })

  it('leaves the trusted server paths (no session user) alone', () => {
    // The Stripe webhook, bulk create, in-person sales and the seeds all run
    // through the local API with no `req.user`; forcing a row non-public there
    // would corrupt live shows.
    expect(nonPublicAuthoringOverrides(null, 'create', { isPublic: true, kind: 'redovna' })).toEqual(
      {},
    )
  })
})
