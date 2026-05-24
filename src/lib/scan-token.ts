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
