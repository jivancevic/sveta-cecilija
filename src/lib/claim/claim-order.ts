// Optional buyer claim for partner orders (ADR-0008). A partner sells a paper
// slip with no buyer PII; the end guest can later "claim" their ticket from the
// unauthenticated /scan/[token] buyer view by entering name + email. Claiming
// is order-level and FIRST-CLAIMER-WINS: the attach is a race-safe
// `UPDATE orders SET email/buyer_name WHERE id AND email IS NULL RETURNING …`,
// so a second concurrent claim (or a sibling-ticket scan) sees already-claimed
// and never overwrites. On a winning claim, the digital ticket PDF is emailed
// exactly once. Claiming is orthogonal to money + seats — the ticket was
// already sold, counted, and invoiced.

export type Locale = 'en' | 'hr'

// The order payload needed to email the tickets after a winning claim.
export interface ClaimableOrder {
  orderId: string
  code: string
  showId: string
  adultCount: number
  childCount: number
  totalCents: number
  locale: Locale
}

export interface ClaimInput {
  orderId: string
  name: string
  email: string
}

export class ClaimValidationError extends Error {
  override name = 'ClaimValidationError'
}

export interface ClaimDeps {
  // First-claimer-wins attach. Returns the order payload if THIS caller won the
  // claim (email was NULL and is now set); null if already claimed or no such
  // unclaimed order. MUST be a single atomic statement
  // (`UPDATE … WHERE id = $1 AND email IS NULL RETURNING …`).
  attachBuyer: (orderId: string, name: string, email: string) => Promise<ClaimableOrder | null>
  // Emails the digital ticket PDF to the freshly-claimed buyer. Called at most
  // once per order (only on the winning claim).
  sendClaimedTickets: (
    order: ClaimableOrder,
    buyer: { name: string; email: string },
  ) => Promise<void>
}

export type ClaimResult = { status: 'CLAIMED' } | { status: 'ALREADY_CLAIMED' }

export async function claimOrder(input: ClaimInput, deps: ClaimDeps): Promise<ClaimResult> {
  const name = (input.name ?? '').trim()
  const email = (input.email ?? '').trim().toLowerCase()
  if (!name) throw new ClaimValidationError('Name is required')
  if (!isPlausibleEmail(email)) throw new ClaimValidationError('A valid email is required')

  const won = await deps.attachBuyer(input.orderId, name, email)
  if (!won) return { status: 'ALREADY_CLAIMED' }

  // Only the winner reaches here, so the ticket email fires exactly once.
  await deps.sendClaimedTickets(won, { name, email })
  return { status: 'CLAIMED' }
}

// Deliberately lenient: blocks obvious garbage without rejecting valid-but-odd
// addresses. The real validation is Brevo accepting the send.
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// "josip@gmail.com" -> "j***@gmail.com". Shown on the read-only claimed view so
// a sibling-ticket holder sees who claimed without exposing the full address.
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  const first = email.slice(0, 1)
  const domain = email.slice(at + 1)
  return `${first}***@${domain}`
}
