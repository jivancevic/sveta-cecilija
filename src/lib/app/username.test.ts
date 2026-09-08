import { describe, expect, it, vi } from 'vitest'
import { allocateUsername, USERNAME_FALLBACK, usernameFromNickname } from './username'

describe('usernameFromNickname', () => {
  it.each([
    ['Cici', 'cici'],
    ['cici', 'cici'],
    ['  Cici  ', 'cici'],
    // Croatian diacritics transliterate, never disappear.
    ['Čičo', 'cico'],
    ['Ćiro', 'ciro'],
    ['Šime', 'sime'],
    ['Žuti', 'zuti'],
    ['Đuro', 'djuro'],
    ['đakon', 'djakon'],
    ['Bepo Đ.', 'bepo-dj'],
    // Everything else becomes a single dash, trimmed at both ends.
    ['Ivan Fabris', 'ivan-fabris'],
    ['Grgo   Mali', 'grgo-mali'],
    ["D'Ado", 'd-ado'],
    ['Cici 2', 'cici-2'],
    ['-Cici-', 'cici'],
  ])('%s → %s', (nickname, expected) => {
    expect(usernameFromNickname(nickname)).toBe(expected)
  })

  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['symbols only', '###'],
    ['null', null],
    ['undefined', undefined],
    ['a non-string', 42 as unknown as string],
  ])('falls back to a usable username for %s', (_label, value) => {
    expect(usernameFromNickname(value)).toBe(USERNAME_FALLBACK)
  })
})

describe('allocateUsername', () => {
  it('takes the plain slug when nothing holds it', async () => {
    const isTaken = vi.fn().mockResolvedValue(false)
    expect(await allocateUsername('Cici', isTaken)).toBe('cici')
    expect(isTaken).toHaveBeenCalledWith('cici')
  })

  it('suffixes with a number on collision, without a dash', async () => {
    const taken = new Set(['cici', 'cici2'])
    const isTaken = vi.fn(async (candidate: string) => taken.has(candidate))
    expect(await allocateUsername('Cici', isTaken)).toBe('cici3')
  })

  it('never collides with a nickname that really is "Cici 2"', async () => {
    const isTaken = vi.fn().mockResolvedValue(false)
    expect(await allocateUsername('Cici 2', isTaken)).toBe('cici-2')
  })

  it('gives up on the series rather than throwing at the voditelj', async () => {
    const isTaken = vi.fn().mockResolvedValue(true)
    const name = await allocateUsername('Cici', isTaken, 3)
    expect(name).toMatch(/^cici\d{10,}$/)
    expect(isTaken).toHaveBeenCalledTimes(3)
  })
})
