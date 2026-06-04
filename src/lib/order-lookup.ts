// Door-side order lookup (tehnika manual-admit fallback, #245). When a guest's
// QR won't scan, the volunteer searches the *active door show* by order code,
// email, or name and admits the matched ticket. This module owns the pure
// logic — normalisation, single-match enforcement (no browsable buyer list),
// the PII boundary on the returned view, and the always-on audit write — behind
// an injected data layer, mirroring scan-token.ts.

export type LookupMode = 'email' | 'name' | 'code'

export interface LookupInput {
  mode: LookupMode
  query: string
  showId: string
}

// What the data layer is asked to match on. The pure function normalises the
// raw query into exactly one of these shapes before the DB ever sees it.
export type NormalizedQuery =
  | { mode: 'email'; email: string }
  | { mode: 'name'; terms: string[] }
  | { mode: 'code'; code: string }

// A raw order row from the data layer. Carries fields the door must NOT see
// (email/total/refundStatus) so the PII boundary is enforced here, in one place,
// rather than trusting every caller to omit them.
export interface MatchedOrder {
  id: string
  buyerName: string
  email: string | null
  adultCount: number
  childCount: number
  total: number
  refundStatus: 'none' | 'refunded'
  tokens: Array<{ token: string; scanned: boolean }>
}

export interface LookupShow {
  date: string
  time: string
  venue: string
}

// The door-safe projection of a matched order: name + party + show + scan
// status + tokens (for the admit action). Deliberately no email, no amounts,
// no refund state.
export interface OrderLookupView {
  id: string
  buyerName: string
  adultCount: number
  childCount: number
  partySize: number
  scannedCount: number
  show: LookupShow
  tokens: Array<{ token: string; scanned: boolean }>
}

export type LookupResult =
  | { status: 'MATCH'; order: OrderLookupView }
  | { status: 'NOT_FOUND' }
  | { status: 'AMBIGUOUS'; count: number }
  | { status: 'INVALID_QUERY'; message: string }

export interface OrderLookupDeps {
  findMatches: (q: NormalizedQuery, showId: string) => Promise<MatchedOrder[]>
  loadShow: (showId: string) => Promise<LookupShow | null>
  recordAudit: (entry: {
    mode: LookupMode
    query: string
    showId: string
    matchedOrderIds: string[]
  }) => Promise<void>
}

function normalize(mode: LookupMode, raw: string):
  | { ok: true; q: NormalizedQuery; auditQuery: string }
  | { ok: false; message: string } {
  const query = raw.trim()
  if (!query) return { ok: false, message: 'Empty query' }
  if (mode === 'email') {
    const email = query.toLowerCase()
    return { ok: true, q: { mode: 'email', email }, auditQuery: email }
  }
  if (mode === 'code') {
    const code = query.toUpperCase()
    return { ok: true, q: { mode: 'code', code }, auditQuery: code }
  }
  // name: require first + last so a one-word query can't fan out the whole show.
  const terms = query.split(/\s+/).filter(Boolean)
  if (terms.length < 2) {
    return { ok: false, message: 'Name search needs first and last name' }
  }
  return { ok: true, q: { mode: 'name', terms }, auditQuery: query.toLowerCase() }
}

function toView(order: MatchedOrder, show: LookupShow): OrderLookupView {
  const partySize = order.adultCount + order.childCount
  const scannedCount = order.tokens.filter((t) => t.scanned).length
  return {
    id: order.id,
    buyerName: order.buyerName,
    adultCount: order.adultCount,
    childCount: order.childCount,
    partySize,
    scannedCount,
    show,
    tokens: order.tokens,
  }
}

export async function lookupOrder(
  input: LookupInput,
  deps: OrderLookupDeps,
): Promise<LookupResult> {
  const norm = normalize(input.mode, input.query)
  if (!norm.ok) return { status: 'INVALID_QUERY', message: norm.message }

  const matches = await deps.findMatches(norm.q, input.showId)

  // Audit every lookup — even a zero-match probe — before returning anything.
  await deps.recordAudit({
    mode: input.mode,
    query: norm.auditQuery,
    showId: input.showId,
    matchedOrderIds: matches.map((m) => m.id),
  })

  if (matches.length === 0) return { status: 'NOT_FOUND' }
  // No browsable buyer list: an ambiguous name search reports a count and asks
  // the volunteer to narrow (or read the order code), never a list of people.
  if (matches.length > 1) return { status: 'AMBIGUOUS', count: matches.length }

  const show = await deps.loadShow(input.showId)
  if (!show) return { status: 'NOT_FOUND' }
  return { status: 'MATCH', order: toView(matches[0], show) }
}
