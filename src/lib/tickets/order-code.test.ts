import { describe, it, expect, vi } from 'vitest'
import {
  generateOrderCode,
  ORDER_CODE_ALPHABET,
  ORDER_CODE_LENGTH,
  type OrderCodeDeps,
} from './order-code'

// Deterministic randomInt that walks a fixed sequence of indices, looping.
function seqRandom(indices: number[]): (max: number) => number {
  let i = 0
  return () => indices[i++ % indices.length]
}

describe('generateOrderCode', () => {
  it('produces a code of the right length from the unambiguous alphabet', async () => {
    const code = await generateOrderCode({
      isUnique: () => true,
      randomInt: seqRandom([0, 1, 2, 3]),
    })
    expect(code).toHaveLength(ORDER_CODE_LENGTH)
    for (const ch of code) expect(ORDER_CODE_ALPHABET).toContain(ch)
  })

  it('never emits an ambiguous glyph (0 O 1 I L)', () => {
    for (const bad of ['0', 'O', '1', 'I', 'L']) {
      expect(ORDER_CODE_ALPHABET).not.toContain(bad)
    }
  })

  it('maps random indices to the expected characters', async () => {
    const code = await generateOrderCode({
      isUnique: () => true,
      randomInt: seqRandom([0, 1, 2, 3]),
    })
    expect(code).toBe(
      ORDER_CODE_ALPHABET[0] + ORDER_CODE_ALPHABET[1] + ORDER_CODE_ALPHABET[2] + ORDER_CODE_ALPHABET[3],
    )
  })

  it('retries on collision until isUnique accepts a code', async () => {
    // First generated code is taken, second is free.
    const isUnique = vi
      .fn<NonNullable<OrderCodeDeps['isUnique']>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    // Two distinct 4-index runs: AAAA then BBBB.
    const code = await generateOrderCode({
      isUnique,
      randomInt: seqRandom([0, 0, 0, 0, 1, 1, 1, 1]),
      maxAttempts: 5,
    })
    expect(isUnique).toHaveBeenCalledTimes(2)
    expect(code).toBe(ORDER_CODE_ALPHABET[1].repeat(ORDER_CODE_LENGTH))
  })

  it('throws after exhausting the attempt budget', async () => {
    const isUnique = vi.fn().mockResolvedValue(false)
    await expect(
      generateOrderCode({ isUnique, randomInt: () => 0, maxAttempts: 3 }),
    ).rejects.toThrow(/after 3 attempts/)
    expect(isUnique).toHaveBeenCalledTimes(3)
  })

  it('supports a synchronous isUnique check', async () => {
    const code = await generateOrderCode({
      isUnique: (c) => c.length === ORDER_CODE_LENGTH,
      randomInt: seqRandom([5, 6, 7, 8]),
    })
    expect(code).toHaveLength(ORDER_CODE_LENGTH)
  })
})
