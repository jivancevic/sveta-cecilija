import { describe, expect, it } from 'vitest'
import {
  APP_NOTIFICATION_KINDS,
  DOOR_INBOX_KINDS,
  audienceFor,
  isAppNotificationKind,
  resolveNotificationAudience,
} from './notification-audience'

// The audience rules of the Sandučić obavijesti (#496).
//
// Pure, so "who gets this" is a table rather than a shape spread over five
// senders. The candidate lists arrive already resolved (dancers through
// `Users.member`, voditelji through `moreska`, staff through `tickets`, the
// door through `door` and nothing else); this decides who is pushed and who is
// merely filed.

describe('audienceFor', () => {
  it('sends the roster notifications to the dancers', () => {
    for (const kind of ['alarm', 'reminder', 'performance_created', 'performance_changed'] as const) {
      expect(audienceFor(kind).group).toBe('roster')
      expect(audienceFor(kind).pushes).toBe(true)
    }
  })

  it('sends a withdrawn "dolazim" to the voditelji', () => {
    expect(audienceFor('withdrawal')).toMatchObject({ group: 'voditelji', pushes: true })
  })

  it('files the two staff kinds without ringing anything', () => {
    for (const kind of ['inquiry', 'dispute'] as const) {
      expect(audienceFor(kind)).toMatchObject({ group: 'staff', pushes: false, doorInbox: false })
    }
  })

  it('covers every kind, so a new one cannot ship without a rule', () => {
    for (const kind of APP_NOTIFICATION_KINDS) {
      expect(audienceFor(kind)).toBeDefined()
    }
  })
})

describe('DOOR_INBOX_KINDS', () => {
  // The open question of #473's fog, settled here: a `door`-only holder is told
  // about the evening itself, in the inbox and never by a push. The roster's
  // alarm and answer reminder are not their business — "javi dolazak" is not a
  // question the person on the gate can answer.
  it('is the two notifications about the evening itself', () => {
    expect([...DOOR_INBOX_KINDS].sort()).toEqual(['performance_changed', 'performance_created'])
  })
})

describe('resolveNotificationAudience', () => {
  const candidates = { primary: ['7', '9'], doorOnly: ['31'] }

  it('pushes and files the primary group', () => {
    expect(resolveNotificationAudience('alarm', candidates)).toEqual({
      push: ['7', '9'],
      inbox: ['7', '9'],
    })
  })

  it('adds a door-only holder to the inbox and never to the push', () => {
    expect(resolveNotificationAudience('performance_changed', candidates)).toEqual({
      push: ['7', '9'],
      inbox: ['7', '9', '31'],
    })
  })

  it('files a staff kind without pushing it', () => {
    expect(resolveNotificationAudience('inquiry', { primary: ['4'], doorOnly: ['31'] })).toEqual({
      push: [],
      inbox: ['4'],
    })
  })

  it('never lists an account twice, even when it is both', () => {
    expect(
      resolveNotificationAudience('performance_created', { primary: ['7', '7'], doorOnly: ['7'] }),
    ).toEqual({ push: ['7'], inbox: ['7'] })
  })

  it('drops blanks and normalises ids to strings', () => {
    expect(
      resolveNotificationAudience('reminder', { primary: ['', '12'], doorOnly: [''] }),
    ).toEqual({ push: ['12'], inbox: ['12'] })
  })

  it('is two empty lists when nobody qualifies', () => {
    expect(resolveNotificationAudience('withdrawal', { primary: [], doorOnly: ['31'] })).toEqual({
      push: [],
      inbox: [],
    })
  })
})

describe('isAppNotificationKind', () => {
  it('accepts a kind the table knows and refuses anything else', () => {
    expect(isAppNotificationKind('alarm')).toBe(true)
    expect(isAppNotificationKind('order')).toBe(false)
    expect(isAppNotificationKind(null)).toBe(false)
  })
})
