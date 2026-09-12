import { describe, expect, it } from 'vitest'
import { buildLineupView, buildPerformanceDetail } from './detail-loaders'

// #432 — the Postava half of the detail loader.
//
// The interesting assertion is story 34: a dancer must never receive a draft.
// It is asserted on the RENDERED PAYLOAD rather than on a template, because the
// visibility rule is a property of the data contract — the same reason
// `detail-loaders.test.ts` asserts the email boundary there.

const performance = (over: Record<string, unknown> = {}) => ({
  id: 10,
  date: '2026-08-05T12:00:00.000Z',
  time: '21:00',
  kind: 'redovna',
  isPublic: true,
  venue: 'ljetno-kino',
  status: 'active',
  thresholdCrni: 8,
  thresholdBili: 8,
  ...over,
})

const members = [
  { id: 1, name: 'Ivan Fabris', nickname: 'Cici', isMoreskant: true, active: true, roles: ['crni', 'crni_kralj'], primaryRole: 'crni_kralj' },
  { id: 2, name: 'Dado Bili', nickname: 'Dado', isMoreskant: true, active: true, roles: ['bili'], primaryRole: 'bili' },
  { id: 3, name: 'Ante Otman', nickname: 'Otman', isMoreskant: true, active: true, roles: ['crni', 'otmanovic'], primaryRole: 'otmanovic' },
]

const lineupDocs = [
  { id: 1, performance: 10, member: 2, role: 'bili' },
  { id: 2, performance: 10, member: 1, role: 'crni_kralj' },
]

const view = (over: Parameters<typeof buildLineupView>[0]['performanceDoc'] = {}, voditelj = true) =>
  buildLineupView({
    performanceDoc: performance(over),
    lineupDocs,
    attendanceRows: [
      { memberId: '1', status: 'coming', army: 'crni' },
      { memberId: '3', status: 'coming', army: 'crni' },
      { memberId: '2', status: 'not_coming', army: null },
    ],
    members: members.map((m) => ({
      id: String(m.id),
      name: m.name,
      nickname: m.nickname,
      mobile: null,
      roles: m.roles,
      primaryRole: m.primaryRole,
      active: m.active,
      isMoreskant: m.isMoreskant,
    })),
    voditelj,
  })

describe('buildLineupView', () => {
  it('labels the stored entries with nicknames, in roster order', () => {
    expect(view().entries).toEqual([
      { memberId: '1', nickname: 'Cici', role: 'crni_kralj' },
      { memberId: '2', nickname: 'Dado', role: 'bili' },
    ])
  })

  it('gives the voditelj the suggestion, the picker and the warnings', () => {
    const v = view()
    // Only the "dolazim" answers, in their suggested roles.
    expect(v.suggested).toEqual([
      { memberId: '1', nickname: 'Cici', role: 'crni_kralj' },
      { memberId: '3', nickname: 'Otman', role: 'otmanovic' },
    ])
    expect(v.roster.map((p) => p.nickname)).toEqual(['Cici', 'Dado', 'Otman'])
    expect(v.warnings).toEqual([])
    expect(v.canEdit).toBe(true)
    expect(v.visible).toBe(true)
  })

  it('warns about a role outside the profile without hiding the row', () => {
    const v = buildLineupView({
      performanceDoc: performance(),
      lineupDocs: [{ id: 1, performance: 10, member: 2, role: 'crni_kralj' }],
      attendanceRows: [],
      members: view().roster.map((p) => ({
        id: p.memberId,
        nickname: p.nickname,
        roles: p.roles,
        primaryRole: p.roles[0] ?? null,
        active: true,
        isMoreskant: true,
      })),
      voditelj: true,
    })
    expect(v.entries).toHaveLength(1)
    expect(v.warnings.map((w) => w.memberId)).toEqual(['2'])
  })

  // Story 31.
  it('is read-only for a voditelj once confirmed, and carries the timestamp', () => {
    const v = view({ lineupConfirmed: true, lineupConfirmedAt: '2026-08-06T08:00:00.000Z' })
    expect(v.confirmed).toBe(true)
    expect(v.confirmedAt).toBe('2026-08-06T08:00:00.000Z')
    expect(v.canEdit).toBe(false)
    expect(v.entries).toHaveLength(2)
  })

  // Story 34: the draft never reaches a dancer.
  it('hands a moreškant NOTHING for a draft lineup', () => {
    const v = view({}, false)
    expect(v.visible).toBe(false)
    expect(v.entries).toEqual([])
    expect(v.suggested).toEqual([])
    expect(v.roster).toEqual([])
    expect(v.warnings).toEqual([])
    expect(v.canEdit).toBe(false)
  })

  // Story 33: past or future, once confirmed.
  it('hands a moreškant the confirmed lineup, with no editing surface', () => {
    const v = view({ lineupConfirmed: true }, false)
    expect(v.visible).toBe(true)
    expect(v.entries).toHaveLength(2)
    expect(v.canEdit).toBe(false)
    // No picker for somebody who cannot write.
    expect(v.roster).toEqual([])
    expect(v.suggested).toEqual([])
  })

  it('drops a row with no member or an unknown role rather than rendering junk', () => {
    const v = buildLineupView({
      performanceDoc: performance(),
      lineupDocs: [
        { id: 1, performance: 10, member: null, role: 'crni' },
        { id: 2, performance: 10, member: 1, role: 'kapetan' },
      ],
      attendanceRows: [],
      members: [],
      voditelj: true,
    })
    expect(v.entries).toEqual([])
  })
})

describe('buildPerformanceDetail lineup', () => {
  it('is part of the detail payload, empty when nothing was loaded', () => {
    const detail = buildPerformanceDetail({
      performanceDoc: performance(),
      attendanceDocs: [],
      memberDocs: [],
      viewer: { memberId: '1', voditelj: false },
      nowMs: Date.UTC(2026, 7, 1),
    })
    expect(detail.lineup.entries).toEqual([])
    expect(detail.lineup.visible).toBe(false)
  })
})
