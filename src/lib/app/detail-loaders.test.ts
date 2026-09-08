import { describe, expect, it, vi } from 'vitest'
import { buildPerformanceDetail, loadPerformanceDetail } from './detail-loaders'
import { toAttendanceMember } from '@/lib/attendance/rules'
import { showStartMs } from '@/lib/show-time'

// #423 — the detail payload: grouping, mobiles present, emails absent, the
// no-answer list built from the active moreškanti, and read-only for a
// moreškant looking back.

const at = (date: string, time: string) => showStartMs(date, time)
const NOW = at('2026-08-05', '12:00')

const show = (over: Record<string, unknown> = {}) => ({
  id: 10,
  date: '2026-08-20T00:00:00.000Z',
  time: '21:00',
  kind: 'redovna',
  isPublic: true,
  venue: 'ljetno-kino',
  status: 'active',
  thresholdCrni: 3,
  thresholdBili: 2,
  voditeljNote: 'Nalazimo se u 20:30.',
  ...over,
})

const memberDoc = (
  id: number,
  nickname: string,
  primaryRole: string,
  roles: string[] = [primaryRole],
  extra: Record<string, unknown> = {},
) => ({
  id,
  name: `Ime ${nickname}`,
  nickname,
  mobile: `+3859100000${id}`,
  email: `${nickname.toLowerCase()}@example.com`,
  roles,
  primaryRole,
  active: true,
  isMoreskant: true,
  ...extra,
})

const roster = [
  memberDoc(1, 'Cici', 'crni'),
  memberDoc(2, 'Bepo', 'crni_kralj', ['crni', 'crni_kralj']),
  memberDoc(3, 'Dado', 'bili'),
  memberDoc(4, 'Frane', 'bula', ['bula']),
  memberDoc(5, 'Grgo', 'crni', ['crni', 'bili']),
]

const answer = (memberId: number, status: string, army: string | null = null) => ({
  id: memberId * 100,
  performance: 10,
  member: memberId,
  status,
  army,
})

function build(over: Partial<Parameters<typeof buildPerformanceDetail>[0]> = {}) {
  return buildPerformanceDetail({
    performanceDoc: show(),
    attendanceDocs: [answer(1, 'coming', 'crni'), answer(3, 'not_coming', 'bili')],
    memberDocs: roster,
    viewer: { memberId: '1', voditelj: false },
    nowMs: NOW,
    ...over,
  })
}

describe('toAttendanceMember', () => {
  it('projects the roster identity and drops the email', () => {
    const out = toAttendanceMember(memberDoc(1, 'Cici', 'crni'))
    expect(out).toEqual({
      id: '1',
      name: 'Ime Cici',
      nickname: 'Cici',
      mobile: '+38591000001',
      roles: ['crni'],
      primaryRole: 'crni',
      active: true,
      isMoreskant: true,
    })
    expect(JSON.stringify(out)).not.toContain('@example.com')
  })
})

describe('buildPerformanceDetail', () => {
  it('groups the coming dancers per army with their mobiles', () => {
    const out = build()
    expect(out.count.crni.nicknames).toEqual(['Cici'])
    expect(out.count.crni.members[0].mobile).toBe('+38591000001')
    expect(out.count.crni).toMatchObject({ count: 1, threshold: 3, below: true })
    expect(out.count.bili).toMatchObject({ count: 0, threshold: 2, below: true })
  })

  it('lists who is not coming and who has not answered', () => {
    const out = build()
    expect(out.count.notComing.map((p) => p.nickname)).toEqual(['Dado'])
    expect(out.count.noAnswer.map((p) => p.nickname)).toEqual(['Bepo', 'Frane', 'Grgo'])
  })

  it('builds the no-answer list from active moreškanti, guests included', () => {
    // Grgo has no login anywhere in this payload; he is still on the list, which
    // is what lets a voditelj answer for him (#419, story 19).
    expect(build().count.noAnswer.map((p) => p.nickname)).toContain('Grgo')
  })

  it('carries no email anywhere in the payload', () => {
    expect(JSON.stringify(build())).not.toContain('@example.com')
  })

  it('offers a move only for a dancer who holds both armies', () => {
    const out = build()
    expect(out.moveTargets).toEqual({ '5': ['crni', 'bili'] })
  })

  it('shows a bula in neither army', () => {
    const out = build({ attendanceDocs: [answer(4, 'coming', null)] })
    expect(out.count.bula.map((p) => p.nickname)).toEqual(['Frane'])
    expect(out.count.crni.count).toBe(0)
    expect(out.count.bili.count).toBe(0)
  })

  it('reports the viewer’s own answer', () => {
    expect(build().performance.myAnswer).toBe('coming')
    expect(build({ viewer: { memberId: '2', voditelj: false } }).performance.myAnswer).toBeNull()
  })
})

describe('buildPerformanceDetail — who may edit', () => {
  const past = show({ date: '2026-08-01T00:00:00.000Z' })

  it('a moreškant may answer an upcoming performance and only for themselves', () => {
    const out = build()
    expect(out.performance.canAnswer).toBe(true)
    expect(out.canEditOthers).toBe(false)
    expect(out.voditelj).toBe(false)
  })

  it('a past performance is read-only for a moreškant', () => {
    const out = build({ performanceDoc: past })
    expect(out.performance.canAnswer).toBe(false)
    expect(out.canEditOthers).toBe(false)
  })

  it('a cancelled performance is read-only for a moreškant', () => {
    const out = build({ performanceDoc: show({ status: 'cancelled' }) })
    expect(out.performance.canAnswer).toBe(false)
  })

  it('a voditelj edits anybody, including after the performance', () => {
    const out = build({ performanceDoc: past, viewer: { memberId: '1', voditelj: true } })
    expect(out.canEditOthers).toBe(true)
    expect(out.performance.canAnswer).toBe(true)
  })

  it('a voditelj who does not dance has no own-answer buttons but still edits others', () => {
    const out = build({ viewer: { memberId: null, voditelj: true } })
    expect(out.myMemberId).toBeNull()
    expect(out.performance.canAnswer).toBe(false)
    expect(out.canEditOthers).toBe(true)
  })

  it('renders a non-public performance around its location', () => {
    const out = build({
      performanceDoc: show({ isPublic: false, kind: 'dmc', location: 'Luka', client: 'Le Ponant' }),
    })
    expect(out.performance).toMatchObject({ venue: null, location: 'Luka', client: 'Le Ponant' })
  })
})

describe('loadPerformanceDetail', () => {
  const deps = (over: Record<string, unknown> = {}) => ({
    loadPerformance: vi.fn(async () => show()),
    loadAttendance: vi.fn(async () => [answer(1, 'coming', 'crni')]),
    loadMoreskanti: vi.fn(async () => roster),
    viewer: { memberId: '1', voditelj: false },
    now: () => new Date(NOW),
    ...over,
  })

  it('answers null for a performance that does not exist', async () => {
    const d = deps({ loadPerformance: vi.fn(async () => null) })
    expect(await loadPerformanceDetail('999', d as never)).toBeNull()
    expect(d.loadAttendance).not.toHaveBeenCalled()
  })

  it('loads the rows for that performance and hands back the detail', async () => {
    const d = deps()
    const out = await loadPerformanceDetail('10', d as never)
    expect(d.loadAttendance).toHaveBeenCalledWith('10')
    expect(out?.count.crni.nicknames).toEqual(['Cici'])
  })
})

// #431 — whether the page offers "Pošalji alarm". Decided in the loader rather
// than in the component so the clock is injected and never read during render.
describe('canAlarm', () => {
  const voditelj = { memberId: '1', voditelj: true }

  it('is true for a voditelj on an evening that is still ahead', () => {
    expect(build({ viewer: voditelj }).canAlarm).toBe(true)
  })

  it('is false for a moreškant, whatever the evening', () => {
    expect(build().canAlarm).toBe(false)
  })

  it('is false once the performance has started, and for a cancelled one', () => {
    expect(build({ viewer: voditelj, nowMs: at('2026-08-20', '21:00') }).canAlarm).toBe(false)
    expect(
      build({ viewer: voditelj, performanceDoc: show({ status: 'cancelled' }) }).canAlarm,
    ).toBe(false)
  })

  it('is still true one minute before the start', () => {
    expect(build({ viewer: voditelj, nowMs: at('2026-08-20', '21:00') - 60_000 }).canAlarm).toBe(
      true,
    )
  })
})
