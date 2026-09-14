import { describe, expect, it } from 'vitest'
import {
  assignTitle,
  checkLineup,
  checkTitles,
  lineupRequirements,
  countTitles,
  isDanceTitle,
  lineupWithTitles,
  titlesForArmy,
  titlesGiven,
} from './titles'
import type { LineupEntry } from './rules'

// #566 — the four titles, driven from outside over fixture rows.
//
// Everything here is a sentence Stanje says in two places at once (the screen
// and the confirm route), so each of them is asserted about the VALUES rather
// than about the component that draws them.

const entry = (memberId: string, role: LineupEntry['role']): LineupEntry => ({ memberId, role })

describe('titlesForArmy', () => {
  it('offers a crni the two crni titles and a bili the one bili title', () => {
    expect(titlesForArmy('crni')).toEqual(['crni_kralj', 'otmanovic'])
    expect(titlesForArmy('bili')).toEqual(['bili_kralj'])
    expect(titlesForArmy('bula')).toEqual(['bula'])
  })

  it('knows a title from a plain role', () => {
    expect(isDanceTitle('crni_kralj')).toBe(true)
    expect(isDanceTitle('crni')).toBe(false)
    expect(isDanceTitle('voditelj')).toBe(false)
  })
})

describe('assignTitle', () => {
  it('takes the title off the previous holder, who goes back to their army', () => {
    const before = [entry('1', 'crni_kralj'), entry('2', 'crni'), entry('3', 'bili')]
    expect(assignTitle(before, { memberId: '2', title: 'crni_kralj' })).toEqual([
      entry('1', 'crni'),
      entry('2', 'crni_kralj'),
      entry('3', 'bili'),
    ])
  })

  it('demotes to the plain role of the title, not of the dancer', () => {
    // Whoever wore the bili kralj is a bili afterwards, whatever their profile
    // says: the fallback follows the title's army, which is the army they were
    // standing in when they got it.
    const before = [entry('1', 'bili_kralj'), entry('2', 'bili')]
    expect(assignTitle(before, { memberId: '2', title: 'bili_kralj' })[0]).toEqual(
      entry('1', 'bili'),
    )
  })

  it('takes a title away without touching anybody else', () => {
    const before = [entry('1', 'otmanovic'), entry('2', 'crni')]
    expect(assignTitle(before, { memberId: '1', title: null })).toEqual([
      entry('1', 'crni'),
      entry('2', 'crni'),
    ])
  })

  it('takes a bula OUT of the postava when her title is taken away', () => {
    // There is no plain bula: the role is the title. She still answered
    // "dolazim" and still stands in the Bule card; she did not dance it.
    expect(
      assignTitle([entry('4', 'bula'), entry('1', 'crni')], { memberId: '4', title: null }),
    ).toEqual([entry('1', 'crni')])
  })

  it('moves the bula from one dancer to another, and the first one leaves', () => {
    expect(assignTitle([entry('4', 'bula')], { memberId: '5', title: 'bula' })).toEqual([
      entry('5', 'bula'),
    ])
  })

  it('adds a row for a dancer who is not in the postava yet', () => {
    // The second bula has no row precisely because the first one has it.
    expect(assignTitle([entry('1', 'crni')], { memberId: '9', title: 'crni_kralj' })).toEqual([
      entry('1', 'crni'),
      entry('9', 'crni_kralj'),
    ])
  })
})

describe('lineupWithTitles', () => {
  const coming = [entry('1', 'crni'), entry('2', 'bili'), entry('3', 'bula')]
  /** Everybody in `coming` answered; nobody else did, unless a test says so. */
  const answered = ['1', '2', '3']

  it('flattens a profile crown out of the suggestion', () => {
    // `buildLineupFromAttendance` hands a crni kralj by trade his primary role;
    // a title comes from the evening and never from the profile (Q65), so the
    // suggestion is reduced to the army and only a STORED title survives.
    expect(
      lineupWithTitles({
        coming: [entry('1', 'crni_kralj'), entry('2', 'bili_kralj')],
        stored: [],
        answered,
      }),
    ).toEqual([entry('1', 'crni'), entry('2', 'bili')])
  })

  it('puts a stored title on top of the answers', () => {
    expect(lineupWithTitles({ coming, stored: [entry('1', 'crni_kralj')], answered })).toEqual([
      entry('1', 'crni_kralj'),
      entry('2', 'bili'),
      entry('3', 'bula'),
    ])
  })

  it('drops a stored row for a member who said no', () => {
    // Not a crown on an empty place: a withdrawal takes the dancer out of the
    // postava, and the title with them.
    expect(
      lineupWithTitles({
        coming,
        stored: [entry('7', 'bili_kralj')],
        answered: [...answered, '7'],
      }),
    ).toEqual(coming)
  })

  it('keeps a stored row for a member with no answer', () => {
    // The MCP tool and the Backoffice editor both dictate a postava for an
    // evening nobody has answered for (story 62). Deriving the list from the
    // answers alone would delete it on the first title tap.
    expect(
      lineupWithTitles({ coming, stored: [entry('7', 'bili_kralj')], answered }),
    ).toEqual([...coming, entry('7', 'bili_kralj')])
  })

  it('keeps a whole dictated postava when nobody has answered at all', () => {
    const dictated = [
      entry('1', 'crni_kralj'),
      entry('2', 'otmanovic'),
      entry('3', 'bili_kralj'),
      entry('4', 'bula'),
      entry('5', 'crni'),
    ]
    expect(lineupWithTitles({ coming: [], stored: dictated, answered: [] })).toEqual(dictated)
  })

  it('drops a title the voditelj has moved out from under', () => {
    // He was the crni kralj; he has been moved across to the bili. A crown that
    // belongs to the other army does not travel with the dancer.
    const moved = [entry('1', 'bili'), entry('2', 'bili')]
    expect(
      lineupWithTitles({ coming: moved, stored: [entry('1', 'crni_kralj')], answered }),
    ).toEqual(moved)
  })

  it('keeps only one bula in the postava, the stored one', () => {
    // Two bule answered; only one dances it. The stored title decides which.
    const two = [entry('3', 'bula'), entry('4', 'bula')]
    expect(
      lineupWithTitles({ coming: two, stored: [entry('4', 'bula')], answered: ['3', '4'] }),
    ).toEqual([entry('4', 'bula')])
  })

  it('picks the first bula when none is stored, which is the ordinary evening', () => {
    const two = [entry('3', 'bula'), entry('4', 'bula')]
    expect(lineupWithTitles({ coming: two, stored: [], answered: ['3', '4'] })).toEqual([
      entry('3', 'bula'),
    ])
  })

  it('leaves the bula with the stored one when she has not answered either way', () => {
    expect(
      lineupWithTitles({
        coming: [entry('3', 'bula')],
        stored: [entry('4', 'bula')],
        answered: ['3'],
      }),
    ).toEqual([entry('4', 'bula')])
  })

  it('keeps the voditelj line, whatever the answers say', () => {
    // Nobody derives "ran the evening without dancing" from an attendance
    // answer, so Stanje must not be the screen that quietly deletes it.
    expect(lineupWithTitles({ coming, stored: [entry('9', 'voditelj')], answered })).toEqual([
      ...coming,
      entry('9', 'voditelj'),
    ])
  })

  it('keeps the voditelj line even for somebody who answered', () => {
    expect(lineupWithTitles({ coming, stored: [entry('2', 'voditelj')], answered })).toEqual([
      entry('1', 'crni'),
      entry('2', 'voditelj'),
      entry('3', 'bula'),
    ])
  })
})

describe('countTitles and titlesGiven', () => {
  it('counts only the four titles, never the plain roles', () => {
    expect(countTitles(['crni', 'crni_kralj', 'bili', 'bula', 'voditelj'])).toEqual({
      crni_kralj: 1,
      otmanovic: 0,
      bili_kralj: 0,
      bula: 1,
    })
  })

  it('counts a doubled title as given by nobody', () => {
    // "Titule N od 4" is how many titles have exactly ONE holder: two crni
    // kraljevi is not a title that has been handed out, it is a mistake.
    expect(titlesGiven(countTitles(['crni_kralj', 'crni_kralj', 'bili_kralj']))).toBe(1)
    expect(titlesGiven(countTitles(['crni_kralj', 'otmanovic', 'bili_kralj', 'bula']))).toBe(4)
  })
})

describe('checkTitles', () => {
  const all = countTitles(['crni_kralj', 'otmanovic', 'bili_kralj', 'bula'])

  it('passes a postava with all four, once each', () => {
    expect(checkTitles(all)).toEqual({ ok: true })
  })

  it('names the missing title in Croatian, in the accusative it is spoken in', () => {
    expect(checkTitles(countTitles(['crni_kralj', 'otmanovic', 'bula']))).toEqual({
      ok: false,
      message: 'Postava nema bilog kralja.',
    })
    expect(checkTitles(countTitles(['otmanovic', 'bili_kralj', 'bula']))).toEqual({
      ok: false,
      message: 'Postava nema crnog kralja.',
    })
    expect(checkTitles(countTitles(['crni_kralj', 'bili_kralj', 'bula']))).toEqual({
      ok: false,
      message: 'Postava nema otmanovića.',
    })
    expect(checkTitles(countTitles(['crni_kralj', 'otmanovic', 'bili_kralj']))).toEqual({
      ok: false,
      message: 'Postava nema bulu.',
    })
  })

  it('counts the doubled dancers in words, and gets the verb right', () => {
    expect(
      checkTitles(countTitles(['crni_kralj', 'otmanovic', 'otmanovic', 'bili_kralj', 'bula'])),
    ).toEqual({ ok: false, message: 'Dva plesača nose titulu Otmanović.' })
    expect(
      checkTitles(
        countTitles(['crni_kralj', 'otmanovic', 'bili_kralj', 'bula', 'bula', 'bula']),
      ),
    ).toEqual({ ok: false, message: 'Tri plesača nose titulu Bula.' })
  })

  it('says everything that is wrong at once', () => {
    expect(checkTitles(countTitles(['otmanovic', 'bula']))).toEqual({
      ok: false,
      message: 'Postava nema crnog kralja. Postava nema bilog kralja.',
    })
  })

  it('refuses an empty postava for all four reasons', () => {
    const out = checkTitles(countTitles([]))
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.message.split('Postava nema').length - 1).toBe(4)
  })
})

describe('lineupRequirements and checkLineup (#620)', () => {
  const ALL_FOUR = { crni_kralj: 1, otmanovic: 1, bili_kralj: 1, bula: 1 }
  const NONE = { crni_kralj: 0, otmanovic: 0, bili_kralj: 0, bula: 0 }

  it('asks a moreška for the four titles and for no voditelj', () => {
    expect(lineupRequirements('redovna')).toEqual({ titles: true, voditelj: false })
    expect(lineupRequirements('koncert')).toEqual({ titles: true, voditelj: false })
  })

  it('asks a Moreška Experience for a voditelj and for no titles', () => {
    expect(lineupRequirements('experience')).toEqual({ titles: false, voditelj: true })
  })

  it('confirms an Experience with a voditelj and not one crown', () => {
    expect(checkLineup({ kind: 'experience', titles: NONE, voditelji: 1 })).toEqual({ ok: true })
  })

  it('refuses an Experience nobody ran, and says so in Croatian', () => {
    const out = checkLineup({ kind: 'experience', titles: ALL_FOUR, voditelji: 0 })
    expect(out).toMatchObject({ ok: false, needed: 'voditelj' })
    expect(out.ok ? '' : out.message).toBe('Postava nema voditelja.')
  })

  it('refuses an Experience two people claim to have run', () => {
    const out = checkLineup({ kind: 'experience', titles: NONE, voditelji: 2 })
    expect(out).toMatchObject({ ok: false, needed: 'voditelj' })
    expect(out.ok ? '' : out.message).toContain('Dva')
  })

  it('never asks a moreška about a voditelj it cannot have', () => {
    expect(checkLineup({ kind: 'redovna', titles: ALL_FOUR, voditelji: 0 })).toEqual({ ok: true })
  })

  it('still names the missing title on a moreška', () => {
    const out = checkLineup({ kind: 'redovna', titles: { ...ALL_FOUR, bula: 0 }, voditelji: 0 })
    expect(out).toMatchObject({ ok: false, needed: 'titles' })
    expect(out.ok ? '' : out.message).toBe('Postava nema bulu.')
  })
})
