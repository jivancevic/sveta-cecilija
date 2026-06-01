// A short, human-readable order reference (e.g. printed on a partner's paper
// slip and read back at the door). 4 characters from an unambiguous uppercase
// alphabet — no 0/O, no 1/I/L — so a guest reading a code aloud or a staffer
// typing it can't confuse glyphs. Uniqueness is enforced by retrying against an
// injected check, so the storage layer owns "is this code taken?" and this
// module stays pure and testable.

export const ORDER_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const ORDER_CODE_LENGTH = 4

export interface OrderCodeDeps {
  /** Returns true if `code` is not already in use. */
  isUnique: (code: string) => boolean | Promise<boolean>
  /** Returns an integer in [0, maxExclusive). Inject crypto.randomInt in prod. */
  randomInt: (maxExclusive: number) => number
  /** Collision-retry budget before giving up. Defaults to 10. */
  maxAttempts?: number
}

/**
 * Generate a unique {@link ORDER_CODE_LENGTH}-char order code, retrying on
 * collision until {@link OrderCodeDeps.isUnique} accepts one or the attempt
 * budget is exhausted.
 */
export async function generateOrderCode(deps: OrderCodeDeps): Promise<string> {
  const maxAttempts = deps.maxAttempts ?? 10
  if (maxAttempts < 1) throw new Error('maxAttempts must be at least 1')

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let code = ''
    for (let i = 0; i < ORDER_CODE_LENGTH; i++) {
      code += ORDER_CODE_ALPHABET[deps.randomInt(ORDER_CODE_ALPHABET.length)]
    }
    if (await deps.isUnique(code)) return code
  }

  throw new Error(`Could not generate a unique order code after ${maxAttempts} attempts`)
}
