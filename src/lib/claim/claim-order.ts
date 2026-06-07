// Optional buyer claim for partner orders (ADR-0008). A partner sells a paper
// slip with no buyer PII; the end guest can later "claim" their ticket from the
// unauthenticated /scan/[token] buyer view by entering name + email. Claiming
// is order-level and FIRST-CLAIMER-WINS: the attach is a race-safe
// `UPDATE orders SET email/buyer_name WHERE id AND email IS NULL RETURNING …`,
// so a second concurrent claim (or a sibling-ticket scan) sees already-claimed
// and never overwrites. On a winning claim, the digital ticket PDF is emailed
// exactly once. Claiming is orthogonal to money + seats — the ticket was
// already sold, counted, and invoiced.
//
// SEND RESULT IS HONEST: the guest is actively waiting and the scan page shows
// them a "Ticket sent. Check your email." banner. The attach commits BEFORE the
// email is sent, so a send failure (e.g. a 401 bad Brevo key) would otherwise
// leave the order claimed but no email delivered, AND the page would still claim
// success. So `claimOrder` reports whether the email actually left (`emailed`),
// and an already-claimed re-submit RE-SENDS to the on-file email (self-heal) so
// a guest who hit a transient failure can simply tap "Get my ticket" again.

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
  // Loads an ALREADY-claimed order plus its on-file buyer (email + name) so a
  // re-submit can re-send the ticket to the address that won the claim — never
  // to the re-submitter's input (would let a passer-by spam a different inbox).
  // Returns null if the order doesn't exist or isn't actually claimed yet.
  loadClaimedOrder: (
    orderId: string,
  ) => Promise<{ order: ClaimableOrder; buyer: { name: string; email: string } } | null>
  // Emails the digital ticket PDF to the buyer. Returns true only if the email
  // actually left (Brevo accepted it); false on any send failure. Idempotent at
  // the domain level: sending the same ticket twice is harmless.
  sendClaimedTickets: (
    order: ClaimableOrder,
    buyer: { name: string; email: string },
  ) => Promise<boolean>
}

// `emailed` is the honest signal the scan page keys its banner off:
//   CLAIMED + emailed:true   → green "Ticket sent. Check your email."
//   CLAIMED + emailed:false  → amber "couldn't send, try again" (attach DID
//                              commit, but no email left — retry re-sends).
//   ALREADY_CLAIMED          → re-send to the on-file email; `emailed` reflects
//                              whether that re-send succeeded.
export type ClaimResult =
  | { status: 'CLAIMED'; emailed: boolean }
  | { status: 'ALREADY_CLAIMED'; emailed: boolean }

export async function claimOrder(input: ClaimInput, deps: ClaimDeps): Promise<ClaimResult> {
  const name = (input.name ?? '').trim()
  const email = (input.email ?? '').trim().toLowerCase()
  if (!name) throw new ClaimValidationError('Name is required')
  if (!isPlausibleEmail(email)) throw new ClaimValidationError('A valid email is required')

  const won = await deps.attachBuyer(input.orderId, name, email)
  if (won) {
    // This caller won the claim — send to the email they just attached.
    const emailed = await deps.sendClaimedTickets(won, { name, email })
    return { status: 'CLAIMED', emailed }
  }

  // Already claimed by someone (possibly this same guest on an earlier attempt
  // whose send failed). Self-heal: re-send to the ON-FILE buyer, not the new
  // input, so a transient Brevo failure doesn't permanently strand the ticket.
  const claimed = await deps.loadClaimedOrder(input.orderId)
  if (!claimed) return { status: 'ALREADY_CLAIMED', emailed: false }
  const emailed = await deps.sendClaimedTickets(claimed.order, claimed.buyer)
  return { status: 'ALREADY_CLAIMED', emailed }
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
