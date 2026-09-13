import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The privacy boundary of Financije (#509), asserted as a source scan.
//
// The acceptance criterion is "no buyer names or emails anywhere on the
// screen", and a screen cannot print what its view model never carried. So the
// check is on the view model and its loader rather than on rendered HTML: if
// none of these four files names a buyer field, no render of them can leak one.
//
// A scan rather than a runtime assertion because the leak this guards against
// is a FIELD being added, usually in a `SELECT *` or a widened projection, and
// a field nobody renders yet would pass any runtime check. Modelled on
// `repo-guard.test.ts` and `show-performance-guard.test.ts`.
//
// Comments are stripped before the scan: the module comments explain the rule
// and must be allowed to name the words the code may not use.

const ROOT = path.resolve(__dirname, '../../..')

/** Everything Financije is made of: the view model, the loader, the screen. */
const FINANCE_FILES = [
  'src/lib/app/finance-view.ts',
  'src/lib/app/finance-data.ts',
  'src/app/app/finance/page.tsx',
  'src/app/app/finance/FinancePickers.tsx',
] as const

/**
 * The buyer, in every spelling this codebase uses for them: the Orders columns
 * (`buyer_name`, `buyer_email`, `buyer_address`), their camelCase field names,
 * and the bare word `email`, which on an order can only ever be a buyer's.
 */
const BUYER_WORDS = [
  'email',
  'e_mail',
  'buyername',
  'buyer_name',
  'buyeraddress',
  'buyer_address',
  'customername',
  'customer_name',
] as const

/** Line comments, block comments and JSX comments; string literals are kept. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('Financije carries no buyer', () => {
  it.each(FINANCE_FILES)('%s names no buyer field', (file) => {
    const code = stripComments(readFileSync(path.join(ROOT, file), 'utf8')).toLowerCase()
    for (const word of BUYER_WORDS) {
      expect(code, `${file} must not mention ${word}`).not.toContain(word)
    }
  })

  it('selects no column of the buyer half of orders', () => {
    // `orders` is joined for money in two of the queries, so the columns it is
    // asked for are worth naming: total, refund_status, partner_id,
    // promo_code_id, created_at and id. Never a buyer, and never `SELECT *`,
    // which is how a widened table quietly becomes a payload.
    const loader = stripComments(
      readFileSync(path.join(ROOT, 'src/lib/app/finance-data.ts'), 'utf8'),
    )
    expect(loader).not.toMatch(/select\s+\*/i)
    expect(loader).not.toMatch(/o\.buyer/i)
  })
})
