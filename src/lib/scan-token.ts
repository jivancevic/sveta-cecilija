export interface OrderDetails {
  buyerName: string
  adultCount: number
  childCount: number
  showId: string
}

export interface ShowDetails {
  date: string
  time: string
  venue: string
}

export type CancelReason = 'storno' | 'refund'

export interface TicketState {
  orderId: string
  scanned: boolean
  scannedAt: string
  status: 'active' | 'cancelled'
  cancelReason: CancelReason | null
}

export interface ScanDeps {
  atomicMarkScanned: (token: string) => Promise<{ orderId: string; scannedAt: string } | null>
  findScannedToken: (token: string) => Promise<{ orderId: string; scannedAt: string } | null>
  // Full ticket state for the staff "not freshly marked" branch — lets us tell
  // cancelled vs already-scanned vs nonexistent apart (ADR-0007 per-person scan).
  findTicket: (token: string) => Promise<TicketState | null>
  findOrderDetails: (orderId: string) => Promise<OrderDetails | null>
  findShowDetails: (showId: string) => Promise<ShowDetails | null>
}

export type ScanResult =
  | {
      status: 'VALID'
      // The order this ticket belongs to — drives the "Admit entire party" action.
      orderId: string
      buyerName: string
      adultCount: number
      childCount: number
      showDate: string
      showTime: string
      venue: string
    }
  | {
      status: 'ALREADY_SCANNED'
      scannedAt: string
      showDate: string
      showTime: string
      venue: string
    }
  | {
      // A voided ticket (storno or refund). Scans to a clear dead-end, never VALID.
      status: 'CANCELLED'
      cancelReason: CancelReason | null
      showDate: string
      showTime: string
      venue: string
    }
  | {
      status: 'BUYER_VIEW'
      token: string
      buyerName: string
      adultCount: number
      childCount: number
      showDate: string
      showTime: string
      venue: string
    }
  | { status: 'INVALID' }

export type ScanViewer = 'buyer' | 'staff'

export const UNDO_WINDOW_MS = 2 * 60 * 1000

export function canUndoScan(scannedAt: string, now: Date = new Date()): boolean {
  if (!scannedAt) return false
  const t = new Date(scannedAt).getTime()
  if (Number.isNaN(t)) return false
  return now.getTime() - t <= UNDO_WINDOW_MS
}

export interface UndoDeps {
  /**
   * Atomically flips scanned -> false for the token, but ONLY when the row's
   * scanned_at is still within `windowMs` of `now`. Returns true if a row was
   * updated. The window check belongs in SQL so concurrent stale requests
   * cannot succeed even if the client thought they could.
   */
  atomicUndo: (token: string, windowMs: number) => Promise<boolean>
}

export type UndoResult = { status: 'UNDONE' } | { status: 'REJECTED' }

export async function undoScan(
  token: string,
  deps: UndoDeps,
  opts: { windowMs?: number } = {},
): Promise<UndoResult> {
  const windowMs = opts.windowMs ?? UNDO_WINDOW_MS
  const ok = await deps.atomicUndo(token, windowMs)
  return ok ? { status: 'UNDONE' } : { status: 'REJECTED' }
}

export async function scanToken(
  token: string,
  deps: ScanDeps,
  opts: { viewer: ScanViewer } = { viewer: 'staff' },
): Promise<ScanResult> {
  if (opts.viewer === 'buyer') {
    const existing = await deps.findScannedToken(token)
    if (!existing) return { status: 'INVALID' }
    const order = await deps.findOrderDetails(existing.orderId)
    if (!order) return { status: 'INVALID' }
    const show = await deps.findShowDetails(order.showId)
    if (!show) return { status: 'INVALID' }
    return {
      status: 'BUYER_VIEW',
      token,
      buyerName: order.buyerName,
      adultCount: order.adultCount,
      childCount: order.childCount,
      showDate: show.date,
      showTime: show.time,
      venue: show.venue,
    }
  }
  // atomicMarkScanned only flips active + unscanned tickets (the SQL carries
  // `AND status = 'active' AND scanned = false`), so a returned row is a genuine
  // first admission.
  const marked = await deps.atomicMarkScanned(token)
  if (marked) {
    const order = await deps.findOrderDetails(marked.orderId)
    if (!order) return { status: 'INVALID' }
    const show = await deps.findShowDetails(order.showId)
    if (!show) return { status: 'INVALID' }
    return {
      status: 'VALID',
      orderId: marked.orderId,
      buyerName: order.buyerName,
      adultCount: order.adultCount,
      childCount: order.childCount,
      showDate: show.date,
      showTime: show.time,
      venue: show.venue,
    }
  }

  // Not freshly marked: cancelled, already-scanned, or unknown. Disambiguate.
  const ticket = await deps.findTicket(token)
  if (!ticket) return { status: 'INVALID' }
  const order = await deps.findOrderDetails(ticket.orderId)
  if (!order) return { status: 'INVALID' }
  const show = await deps.findShowDetails(order.showId)
  if (!show) return { status: 'INVALID' }

  if (ticket.status === 'cancelled') {
    return {
      status: 'CANCELLED',
      cancelReason: ticket.cancelReason,
      showDate: show.date,
      showTime: show.time,
      venue: show.venue,
    }
  }
  if (ticket.scanned) {
    return {
      status: 'ALREADY_SCANNED',
      scannedAt: ticket.scannedAt,
      showDate: show.date,
      showTime: show.time,
      venue: show.venue,
    }
  }
  // Active + unscanned yet atomicMarkScanned returned null: a lost race against a
  // concurrent scan. Safe to report INVALID (no admission happened here).
  return { status: 'INVALID' }
}

export interface AdmitPartyDeps {
  /**
   * Atomically marks every still-active, not-yet-scanned ticket of the order
   * scanned, returning how many rows it flipped. Race-safe: N parallel taps
   * admit each person at most once because the UPDATE filters `scanned = false`.
   */
  atomicAdmitParty: (orderId: string) => Promise<number>
}

export type AdmitPartyResult = { status: 'ADMITTED'; admitted: number }

/**
 * "Admit entire party" — marks all remaining active tickets of an order scanned
 * in one tap. `admitted` is the number of people newly walked in (0 if the rest
 * were already scanned).
 */
export async function admitParty(
  orderId: string,
  deps: AdmitPartyDeps,
): Promise<AdmitPartyResult> {
  const admitted = await deps.atomicAdmitParty(orderId)
  return { status: 'ADMITTED', admitted }
}
