import { getPayload } from 'payload'
import config from '@payload-config'
import { toIsoDate } from '@/lib/to-iso-date'
import { relationIdString } from '@/lib/payload-relation'
import type { PerformanceKind } from '@/lib/show-performance'
import {
  NIZ_WINDOW,
  currentNizByMember,
  nizChain,
  type NizLineupRow,
  type NizPerformance,
} from './niz'

// The IO wiring behind the niz (#628) — the `stats-data.ts` shape: the Payload
// calls and nothing else, so every rule about what a niz IS stays in the pure,
// unit-tested `niz.ts`.
//
// **Two queries, and the first one is what keeps the second small.** The chain
// is the confirmed moreške, newest first, capped at `NIZ_WINDOW`; the lineups
// are read for exactly those evenings. A niz crosses seasons, so neither query
// is scoped to one — which is the whole reason this is not folded into
// `stats-data.ts`, whose every read is a season's.
//
// The local API runs with `overrideAccess: true`, so collection access scopes
// none of this; the caller has already established through the `/app` access
// decision that the viewer is on the roster, and a confirmed postava is
// readable by every moreškant (CONTEXT.md → *Dancer statistics*).

/** Today in Korčula, YYYY-MM-DD: the front of the chain. */
export function todayInZagreb(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' })
}

function toNizPerformance(doc: Record<string, unknown>): NizPerformance {
  return {
    id: String(doc.id),
    date: toIsoDate(doc.date),
    kind: (doc.kind as PerformanceKind) ?? 'redovna',
    confirmed: doc.lineupConfirmed === true,
    cancelled: doc.status === 'cancelled',
  }
}

/**
 * The chain: ids of confirmed moreške that have been danced, newest first.
 *
 * The `where` and `nizChain` apply the same rules, deliberately: the query is
 * what makes the read small and the pure function is what makes it right, and
 * a predicate that only exists in SQL is a rule nothing tests. The two are not
 * quite identical in their tolerance of a NULL — `not_equals` drops a NULL
 * `kind` or `status` in SQL, while `toNizPerformance` below reads one as
 * `redovna` and "not cancelled" — and that gap is unreachable rather than
 * intended: both columns are `required` with a default (`src/collections/
 * Shows.ts`). The looser reading is the safe one either way.
 */
export async function loadNizChain(limit: number = NIZ_WINDOW): Promise<string[]> {
  const payload = await getPayload({ config })
  const today = todayInZagreb()

  const docs = (
    await payload.find({
      collection: 'shows',
      where: {
        and: [
          { lineupConfirmed: { equals: true } },
          { kind: { not_equals: 'experience' } },
          { status: { not_equals: 'cancelled' } },
          // The end of TODAY, so an evening danced tonight joins the chain the
          // moment its postava is confirmed rather than the next morning.
          // Shows are stored at noon UTC (`to-iso-date.ts`), so this bound and
          // `nizChain`'s own `date <= today` admit exactly the same evenings.
          { date: { less_than: `${today}T23:59:59.999Z` } },
        ],
      },
      sort: '-date',
      limit,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as unknown as Record<string, unknown>[]

  return nizChain(docs.map(toNizPerformance), today)
}

/**
 * Every dancer's running niz, keyed by member id; a dancer with none is absent.
 *
 * What the two list screens hang their flame off. One read of the chain's
 * lineups rather than one per dancer, because Ljestvica draws seventy rows.
 */
export async function getRunningNiz(): Promise<Record<string, number>> {
  const chain = await loadNizChain()
  if (chain.length === 0) return {}

  const payload = await getPayload({ config })
  const docs = (
    await payload.find({
      collection: 'lineups',
      where: { performance: { in: chain } },
      // Provably enough rather than hopefully enough: the chain is capped at
      // `NIZ_WINDOW` (60) and a postava is a couple of dozen rows at the very
      // most, so this read cannot reach its own limit. A truncated read would
      // SHORTEN somebody's niz and take their flame away with no error to
      // notice, which is why the bound is argued rather than guessed.
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as unknown as Record<string, unknown>[]

  const rows: NizLineupRow[] = []
  for (const doc of docs) {
    const performanceId = relationIdString(doc.performance)
    const memberId = relationIdString(doc.member)
    // A `voditelj` line is NOT excluded here and does not need to be: he can
    // only ever appear on an Experience (the lineup routes refuse the role
    // anywhere else), and no Experience is in the chain.
    if (performanceId && memberId) rows.push({ performanceId, memberId })
  }

  return currentNizByMember(chain, rows)
}
