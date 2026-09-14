import { describe, expect, it } from 'vitest'
import { PERFORMANCE_KINDS, type PerformanceKind } from '@/lib/show-performance'
import { type DancerStats } from '@/lib/lineup/stats'
import { DANCE_ROLES, type DanceRole } from '@/lib/moreskant-profile'
import { pluralize } from './roster-loaders'
import { APP_STRINGS } from './strings'
import {
  BOARD_FILTERS,
  TOP_ROWS,
  armyOfPrimaryRole,
  boardView,
  filterCountsTitle,
  kindsOf,
  myStanding,
  parseBoardFilter,
  parseLeaderboardKind,
  rankDancers,
  rankMovement,
  roleTallies,
} from './leaderboard-rank'

const noRoles = () =>
  Object.fromEntries(DANCE_ROLES.map((r) => [r, 0])) as Record<DanceRole, number>

/**
 * A scoreboard row with its counts spread over the kinds the caller names, and
 * optionally over the roles within one of them.
 *
 * `roles` is keyed by kind so a fixture can say "twelve Redovne, three of them
 * as crni kralj" — which is the shape every #607 rule reasons about.
 */
function dancer(
  memberId: string,
  nickname: string,
  byKind: Partial<Record<PerformanceKind, number>>,
  roles: Partial<Record<PerformanceKind, Partial<Record<DanceRole, number>>>> = {},
): DancerStats {
  const kinds = Object.fromEntries(PERFORMANCE_KINDS.map((k) => [k, 0])) as Record<
    PerformanceKind,
    number
  >
  for (const [kind, count] of Object.entries(byKind)) {
    kinds[kind as PerformanceKind] = count ?? 0
  }

  const rolesByKind = Object.fromEntries(
    PERFORMANCE_KINDS.map((k) => [k, noRoles()]),
  ) as Record<PerformanceKind, Record<DanceRole, number>>
  const total = noRoles()
  for (const [kind, byRole] of Object.entries(roles)) {
    for (const [role, count] of Object.entries(byRole ?? {})) {
      rolesByKind[kind as PerformanceKind][role as DanceRole] = count ?? 0
      total[role as DanceRole] += count ?? 0
    }
  }

  return {
    memberId,
    nickname,
    performances: Object.values(kinds).reduce((a, b) => a + b, 0),
    roles: total,
    rolesByKind,
    byKind: kinds,
  }
}

describe('parseLeaderboardKind', () => {
  it('opens on Moreška by default', () => {
    expect(parseLeaderboardKind(undefined)).toBe('moreska')
    expect(parseLeaderboardKind('nesto')).toBe('moreska')
  })

  it('opens on Experience when the URL asks for it', () => {
    expect(parseLeaderboardKind('experience')).toBe('experience')
  })
})

describe('kindsOf', () => {
  it('counts every kind except experience as Moreška', () => {
    expect(kindsOf('moreska')).toEqual(PERFORMANCE_KINDS.filter((k) => k !== 'experience'))
  })

  it('counts the Experience on its own', () => {
    expect(kindsOf('experience')).toEqual(['experience'])
  })

  it('leaves no kind out of both lists', () => {
    const covered = [...kindsOf('moreska'), ...kindsOf('experience')].sort()
    expect(covered).toEqual([...PERFORMANCE_KINDS].sort())
  })
})

describe('armyOfPrimaryRole', () => {
  it('reads the army off the primary role, the bula on her own disc', () => {
    expect(armyOfPrimaryRole('crni_kralj')).toBe('crni')
    expect(armyOfPrimaryRole('bili')).toBe('bili')
    expect(armyOfPrimaryRole('bula')).toBe('bula')
  })

  it('has no army for a dancer with no primary role', () => {
    expect(armyOfPrimaryRole(null)).toBeNull()
    expect(armyOfPrimaryRole('voditelj')).toBeNull()
  })
})

describe('rankDancers', () => {
  it('shares a rank between equal counts and skips the next one', () => {
    const rows = rankDancers({
      rows: [
        dancer('1', 'Ante', { redovna: 12 }),
        dancer('2', 'Bepo', { redovna: 12 }),
        dancer('3', 'Cico', { redovna: 7 }),
      ],
      kind: 'moreska',
    })
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3])
    expect(rows.map((r) => r.nickname)).toEqual(['Ante', 'Bepo', 'Cico'])
  })

  it('ranks the Experience list by its own count, not by the season', () => {
    // Ante has the bigger season; Cico has danced every Experience. The
    // Experience list is Cico's, or it is a list ordered by a number it does
    // not show.
    const rows = rankDancers({
      rows: [
        dancer('1', 'Ante', { redovna: 12, experience: 1 }),
        dancer('3', 'Cico', { redovna: 2, experience: 6 }),
      ],
      kind: 'experience',
    })
    expect(rows.map((r) => [r.nickname, r.performances])).toEqual([
      ['Cico', 6],
      ['Ante', 1],
    ])
  })

  it('counts every kind except experience into the Moreška list', () => {
    const rows = rankDancers({
      rows: [dancer('1', 'Ante', { redovna: 8, dmc: 2, koncert: 1, experience: 5 })],
      kind: 'moreska',
    })
    expect(rows[0].performances).toBe(11)
  })

  it('keeps a moreškant who danced nothing on the list', () => {
    const rows = rankDancers({
      rows: [dancer('1', 'Ante', { redovna: 3 }), dancer('2', 'Bepo', {})],
      kind: 'moreska',
    })
    expect(rows.map((r) => [r.nickname, r.performances, r.rank])).toEqual([
      ['Ante', 3, 1],
      ['Bepo', 0, 2],
    ])
  })

  it('marks the reader own row and nobody else', () => {
    const rows = rankDancers({
      rows: [dancer('1', 'Ante', { redovna: 3 }), dancer('2', 'Bepo', { redovna: 1 })],
      kind: 'moreska',
      myMemberId: '2',
    })
    expect(rows.filter((r) => r.me).map((r) => r.nickname)).toEqual(['Bepo'])
  })

  it('says "puna sezona" only for the dancer who danced all of it', () => {
    const rows = rankDancers({
      rows: [dancer('1', 'Ante', { redovna: 9 }), dancer('2', 'Bepo', { redovna: 8 })],
      kind: 'moreska',
      confirmed: 9,
    })
    expect(rows.map((r) => r.fullSeason)).toEqual([true, false])
  })

  it('never puts a title on a row, whatever the profile says', () => {
    const rows = rankDancers({
      rows: [dancer('1', 'Ante', { redovna: 9 })],
      kind: 'moreska',
      primaryRoles: { '1': 'crni_kralj' },
    })
    expect(rows[0].army).toBe('crni')
    expect(rows[0].title).toBeNull()
  })
})

// The sentence the standing is printed as. Croatian declines, and a counted
// noun after "s" is in the instrumental: the nominative `moreska.count` read
// "Ti si 24. s 1 nastup", which is the kind of sentence that tells a dancer the
// app was written by somebody who does not speak to them (#568).
describe('the standing sentence', () => {
  const say = (n: number, rank = 24) =>
    APP_STRINGS.board.standing(rank, pluralize(n, APP_STRINGS.board.withCount))

  it('puts one nastup in the instrumental', () => {
    expect(say(1)).toBe('Ti si 24. s 1 nastupom.')
  })

  it('keeps the genitive for every other bucket', () => {
    expect(say(3, 9)).toBe('Ti si 9. s 3 nastupa.')
    expect(say(14, 9)).toBe('Ti si 9. s 14 nastupa.')
    expect(say(21, 2)).toBe('Ti si 2. s 21 nastupom.')
  })
})

describe('myStanding', () => {
  const rows = [
    dancer('1', 'Ante', { redovna: 12 }),
    dancer('2', 'Bepo', { redovna: 12 }),
    dancer('3', 'Cico', { redovna: 7 }),
  ]

  it('names the place the next count actually holds, not rank minus one', () => {
    // Ranks 1, 1, 3: five more nastupa tie the two at the top, and a tie shares
    // their rank. "Još 5 do 2. mjesta" would name a place nobody holds.
    const me = myStanding(rankDancers({ rows, kind: 'moreska', myMemberId: '3' }))
    expect(me).toEqual({ rank: 3, performances: 7, total: 3, toNextPlace: 5, nextPlace: 1 })
  })

  it('has no gap to close at the top', () => {
    const me = myStanding(rankDancers({ rows, kind: 'moreska', myMemberId: '1' }))
    expect(me?.rank).toBe(1)
    expect(me?.toNextPlace).toBeNull()
    expect(me?.nextPlace).toBeNull()
  })

  it('is null for a reader with no row on the list', () => {
    expect(myStanding(rankDancers({ rows, kind: 'moreska', myMemberId: null }))).toBeNull()
  })
})

describe('boardView', () => {
  const many = Array.from({ length: 26 }, (_, i) =>
    dancer(String(i + 1), `D${String(i + 1).padStart(2, '0')}`, { redovna: 26 - i }),
  )

  it('cuts the screen list at twenty rows and says there are more', () => {
    const view = boardView(rankDancers({ rows: many, kind: 'moreska' }))
    expect(view.podium).toHaveLength(3)
    expect(view.rows).toHaveLength(TOP_ROWS - 3)
    expect(view.podium.length + view.rows.length).toBe(TOP_ROWS)
    expect(view.total).toBe(26)
    expect(view.truncated).toBe(true)
  })

  it('pins the reader own row when it falls outside the cut', () => {
    const view = boardView(rankDancers({ rows: many, kind: 'moreska', myMemberId: '25' }))
    expect(view.pinned?.nickname).toBe('D25')
    expect(view.pinned?.rank).toBe(25)
    expect(view.rows.some((r) => r.me)).toBe(false)
  })

  it('does not pin a reader who is already on the screen', () => {
    const view = boardView(rankDancers({ rows: many, kind: 'moreska', myMemberId: '4' }))
    expect(view.pinned).toBeNull()
    expect(view.me?.rank).toBe(4)
    expect(view.rows.some((r) => r.me)).toBe(true)
  })

  it('shows a short list whole and pins nobody', () => {
    const view = boardView(
      rankDancers({
        rows: [dancer('1', 'Ante', { redovna: 3 }), dancer('2', 'Bepo', { redovna: 1 })],
        kind: 'moreska',
        myMemberId: '2',
      }),
    )
    expect(view.podium).toHaveLength(2)
    expect(view.rows).toHaveLength(0)
    expect(view.pinned).toBeNull()
    expect(view.truncated).toBe(false)
  })

  it('cuts by position, so a tie at the cut does not change how many are shown', () => {
    const tied = Array.from({ length: 25 }, (_, i) => dancer(String(i + 1), `D${i + 1}`, { redovna: 4 }))
    const view = boardView(rankDancers({ rows: tied, kind: 'moreska' }))
    expect(view.podium.length + view.rows.length).toBe(TOP_ROWS)
    expect(view.podium.every((r) => r.rank === 1)).toBe(true)
  })
})

/* ── The seven chips (#607, decision Q2) ────────────────────────────────────
   The cast is the one the decision was made on: Cici's primary role is crni and
   he fills in as bili when that army is short, which is the case that decides
   why an army chip counts his WHOLE season rather than the nights he wore
   black. */

const MARKAN = dancer('1', 'Markan', { redovna: 20 }, {
  redovna: { crni: 9, crni_kralj: 8, otmanovic: 3 },
})
const CICI = dancer('2', 'Cici', { redovna: 18 }, {
  redovna: { crni: 12, crni_kralj: 3, bili: 3 },
})
const JADRO = dancer('3', 'Jadro', { redovna: 17 }, {
  redovna: { bili: 11, bili_kralj: 6 },
})
const MARE = dancer('4', 'Mare', { redovna: 11 }, { redovna: { bula: 11 } })
/** An active moreškant who has danced nothing this season. */
const IVO = dancer('5', 'Ivo', {})

const CAST = [MARKAN, CICI, JADRO, MARE, IVO]
const PRIMARY = { '1': 'crni', '2': 'crni', '3': 'bili', '4': 'bula', '5': 'crni' }

const board = (filter: Parameters<typeof parseBoardFilter>[0] | undefined, extra = {}) =>
  rankDancers({
    rows: CAST,
    kind: 'moreska',
    filter: parseBoardFilter(filter),
    primaryRoles: PRIMARY,
    confirmed: 21,
    ...extra,
  })

describe('parseBoardFilter', () => {
  it('opens on everybody by default, and for a chip that no longer exists', () => {
    expect(parseBoardFilter(undefined)).toBe('svi')
    expect(parseBoardFilter('kapetan')).toBe('svi')
  })

  it('takes every chip the screen draws', () => {
    for (const filter of BOARD_FILTERS) expect(parseBoardFilter(filter)).toBe(filter)
  })
})

describe('filterCountsTitle', () => {
  it('is the three chips that count a title being given', () => {
    expect(BOARD_FILTERS.filter(filterCountsTitle)).toEqual([
      'crni_kralj',
      'bili_kralj',
      'otmanovic',
    ])
  })

  it('leaves the bula with the armies, because her two readings are one number', () => {
    // A bula who is not in the postava has no lineup row at all, so "evenings
    // danced" and "evenings as bula" cannot disagree (CONTEXT.md → Title).
    expect(filterCountsTitle('bula')).toBe(false)
  })
})

describe('rankDancers, the army chips', () => {
  it('counts a crni’s WHOLE season, the nights he filled in as bili included', () => {
    const crni = board('crni')
    const cici = crni.find((r) => r.nickname === 'Cici')!
    expect(cici.performances).toBe(18)
    expect(cici.rank).toBe(2)
  })

  it('never lists him under the other army, however often he filled in', () => {
    expect(board('bili').map((r) => r.nickname)).toEqual(['Jadro'])
  })

  it('drops a dancer who has danced nothing, because only SVI keeps the zeros', () => {
    expect(board('svi').map((r) => r.nickname)).toContain('Ivo')
    expect(board('crni').map((r) => r.nickname)).not.toContain('Ivo')
  })
})

describe('rankDancers, the title chips', () => {
  it('ranks by how many times the title was given, not by evenings danced', () => {
    expect(board('crni_kralj').map((r) => [r.rank, r.nickname, r.performances])).toEqual([
      [1, 'Markan', 8],
      [2, 'Cici', 3],
    ])
  })

  it('restarts the rank at 1 rather than carrying the season’s places over', () => {
    // Jadro is third on the season and first among bili kraljevi.
    expect(board('bili_kralj')[0]).toMatchObject({ rank: 1, nickname: 'Jadro' })
  })

  it('leaves out everybody who never wore it', () => {
    expect(board('otmanovic').map((r) => r.nickname)).toEqual(['Markan'])
  })

  it('never calls a season of crowns a puna sezona', () => {
    const all = rankDancers({
      rows: [dancer('9', 'Kralj', { redovna: 3 }, { redovna: { crni_kralj: 3 } })],
      kind: 'moreska',
      filter: 'crni_kralj',
      confirmed: 3,
    })
    expect(all[0].fullSeason).toBe(false)
  })

  it('counts the bula the same either way, which is why she is not a title chip', () => {
    expect(board('bula')[0].performances).toBe(11)
  })
})

describe('rankDancers, the disc', () => {
  it('carries the dancer’s initials, and never a crown', () => {
    const rows = board(undefined, { initials: { '2': 'NŠ' } })
    const cici = rows.find((r) => r.nickname === 'Cici')!
    expect(cici.initials).toBe('NŠ')
    expect(cici.title).toBeNull()
  })

  it('leaves the initials empty when the roster has no name to take them from', () => {
    expect(board(undefined)[0].initials).toBe('')
  })
})

describe('roleTallies', () => {
  it('adds up to the count printed beside them', () => {
    const tallies = roleTallies(CICI, 'moreska')
    expect(tallies.reduce((sum, t) => sum + t.count, 0)).toBe(CICI.performances)
  })

  it('drops the roles nobody wore, and groups the armies', () => {
    expect(roleTallies(CICI, 'moreska')).toEqual([
      { role: 'crni', count: 12 },
      { role: 'crni_kralj', count: 3 },
      { role: 'bili', count: 3 },
    ])
  })

  it('counts only the list’s own kinds', () => {
    const split = dancer('7', 'Duje', { redovna: 2, experience: 4 }, {
      redovna: { crni: 2 },
      experience: { crni: 1, crni_kralj: 3 },
    })
    expect(roleTallies(split, 'experience')).toEqual([
      { role: 'crni', count: 1 },
      { role: 'crni_kralj', count: 3 },
    ])
  })
})

describe('rankMovement', () => {
  const me = (rank: number) => [{ ...board(undefined)[0], rank, me: true }]

  it('is positive when the reader climbed', () => {
    expect(rankMovement(me(3), me(5))).toBe(2)
  })

  it('reports a drop exactly like a rise', () => {
    expect(rankMovement(me(6), me(4))).toBe(-2)
  })

  it('says nothing when nothing moved, because a zero is not news', () => {
    expect(rankMovement(me(4), me(4))).toBeNull()
  })

  it('says nothing for a reader who is on neither ranking', () => {
    expect(rankMovement(board(undefined), board(undefined))).toBeNull()
  })
})
