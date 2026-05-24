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

export interface ScanDeps {
  atomicMarkScanned: (token: string) => Promise<{ orderId: string; scannedAt: string } | null>
  findScannedToken: (token: string) => Promise<{ orderId: string; scannedAt: string } | null>
  findOrderDetails: (orderId: string) => Promise<OrderDetails | null>
  findShowDetails: (showId: string) => Promise<ShowDetails | null>
}

export type ScanResult =
  | {
      status: 'VALID'
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
  const marked = await deps.atomicMarkScanned(token)
  if (marked) {
    const order = await deps.findOrderDetails(marked.orderId)
    if (!order) return { status: 'INVALID' }
    const show = await deps.findShowDetails(order.showId)
    if (!show) return { status: 'INVALID' }
    return {
      status: 'VALID',
      buyerName: order.buyerName,
      adultCount: order.adultCount,
      childCount: order.childCount,
      showDate: show.date,
      showTime: show.time,
      venue: show.venue,
    }
  }
  const existing = await deps.findScannedToken(token)
  if (!existing) return { status: 'INVALID' }
  const order = await deps.findOrderDetails(existing.orderId)
  if (!order) return { status: 'INVALID' }
  const show = await deps.findShowDetails(order.showId)
  if (!show) return { status: 'INVALID' }
  return {
    status: 'ALREADY_SCANNED',
    scannedAt: existing.scannedAt,
    showDate: show.date,
    showTime: show.time,
    venue: show.venue,
  }
}
