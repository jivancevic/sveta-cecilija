import { describe, expect, it } from 'vitest'
import {
  assignTitle,
  checkTitles,
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

  it('flattens a profile crown out of the suggestion', () => {
    // `buildLineupFromAttendance` hands a crni kralj by trade his primary role;
    // a title comes from the evening and never from the profile (Q65), so the
    // suggestion is reduced to the army and only a STORED title survives.
    expect(
      lineupWithTitles({ coming: [entry('1', 'crni_kralj'), entry('2', 'bili_kralj')], stored: [] }),
    ).toEqual([entry('1', 'crni'), entry('2', 'bili')])
  })

  it('puts a stored title on top of the answers', () => {
    expect(lineupWithTitles({ coming, stored: [entry('1', 'crni_kralj')] })).toEqual([
      entry('1', 'crni_kralj'),
      entry('2', 'bili'),
      entry('3', 'bula'),
    ])
  })

  it('drops a title whose holder has since said "ne dolazim"', () => {
    // Not a crown on an empty place: the answers are the live truth of who is
    // dancing, and a stored title is only ever a decoration on one of them.
    expect(lineupWithTitles({ coming, stored: [entry('7', 'bili_kralj')] })).toEqual(coming)
  })

  it('drops a title the voditelj has moved out from under', () => {
    // He was the crni kralj; he has been moved across to the bili. A crown that
    // belongs to the other army does not travel with the dancer.
    const moved = [entry('1', 'bili'), entry('2', 'bili')]
    expect(lineupWithTitles({ coming: moved, stored: [entry('1', 'crni_kralj')] })).toEqual(moved)
  })

  it('keeps only one bula in the postava, the stored one', () => {
    // Two bule answered; only one dances it. The stored title decides which.
    const two = [entry('3', 'bula'), entry('4', 'bula')]
    expect(lineupWithTitles({ coming: two, stored: [entry('4', 'bula')] })).toEqual([
      entry('4', 'bula'),
    ])
  })

  it('picks the first bula when none is stored, which is the ordinary evening', () => {
    const two = [entry('3', 'bula'), entry('4', 'bula')]
    expect(lineupWithTitles({ coming: two, stored: [] })).toEqual([entry('3', 'bula')])
  })

  it('keeps the voditelj line, whatever the answers say', () => {
    // Nobody derives "ran the evening without dancing" from an attendance
    // answer, so Stanje must not be the screen that quietly deletes it.
    expect(lineupWithTitles({ coming, stored: [entry('9', 'voditelj')] })).toEqual([
      ...coming,
      entry('9', 'voditelj'),
    ])
  })

  it('keeps the voditelj line even for somebody who answered', () => {
    expect(lineupWithTitles({ coming, stored: [entry('2', 'voditelj')] })).toEqual([
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
