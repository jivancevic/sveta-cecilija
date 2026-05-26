import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { headers } from 'next/headers'
import QRCode from 'qrcode'
import config from '@payload-config'
import {
  scanToken,
  canUndoScan,
  type ScanDeps,
  type ScanResult,
  type ScanViewer,
} from '@/lib/scan-token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VENUE_NAME: Record<string, string> = {
  'ljetno-kino': 'Ljetno kino',
  'zimsko-kino': 'Centar za kulturu',
}

async function buildDeps(): Promise<ScanDeps> {
  const payload = await getPayload({ config })
  // Drizzle instance is exposed on the postgres adapter as `db.drizzle`.
  // We type as `any` here because Payload does not export the adapter's
  // internal types in its public surface.
  const drizzle: any = (payload.db as any).drizzle

  return {
    atomicMarkScanned: async (token) => {
      const res: any = await drizzle.execute(sql`
        UPDATE qr_tokens
        SET scanned = true,
            scanned_at = NOW(),
            updated_at = NOW()
        WHERE token = ${token} AND scanned = false
        RETURNING order_id, scanned_at
      `)
      const row = (res.rows ?? res)[0]
      if (!row) return null
      const scannedAt =
        row.scanned_at instanceof Date ? row.scanned_at.toISOString() : String(row.scanned_at)
      return { orderId: String(row.order_id), scannedAt }
    },
    findScannedToken: async (token) => {
      const res: any = await drizzle.execute(sql`
        SELECT order_id, scanned_at
        FROM qr_tokens
        WHERE token = ${token}
        LIMIT 1
      `)
      const row = (res.rows ?? res)[0]
      if (!row) return null
      const scannedAt =
        row.scanned_at instanceof Date
          ? row.scanned_at.toISOString()
          : row.scanned_at
            ? String(row.scanned_at)
            : ''
      return { orderId: String(row.order_id), scannedAt }
    },
    findOrderDetails: async (orderId) => {
      try {
        const doc = await payload.findByID({ collection: 'orders', id: orderId, depth: 0 })
        return {
          buyerName: (doc.buyerName as string) ?? '',
          adultCount: (doc.adultCount as number) ?? 0,
          childCount: (doc.childCount as number) ?? 0,
          showId: String(doc.show),
        }
      } catch {
        return null
      }
    },
    findShowDetails: async (showId) => {
      try {
        const doc = await payload.findByID({ collection: 'shows', id: showId, depth: 0 })
        return {
          date: new Date(doc.date as string).toISOString().slice(0, 10),
          time: doc.time as string,
          venue: doc.venue as string,
        }
      } catch {
        return null
      }
    },
  }
}

function formatShowDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatScannedAt(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function ShowLine({
  showDate,
  showTime,
  venue,
}: {
  showDate: string
  showTime: string
  venue: string
}) {
  return (
    <div style={{ fontSize: '1.25rem', marginTop: '1rem', opacity: 0.92 }}>
      <div>{formatShowDate(showDate)} · {showTime}</div>
      <div>{VENUE_NAME[venue] ?? venue}</div>
    </div>
  )
}

function BuyerView({
  result,
  qrDataUrl,
}: {
  result: Extract<ScanResult, { status: 'BUYER_VIEW' }>
  qrDataUrl: string
}) {
  const totalTickets = result.adultCount + result.childCount
  return (
    <main
      style={{
        background: '#111',
        color: '#fff',
        minHeight: '100vh',
        padding: '1.5rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ fontSize: '0.875rem', letterSpacing: '0.1em', opacity: 0.7, textTransform: 'uppercase' }}>
        Your ticket
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem' }}>
        {result.buyerName}
      </div>
      <div style={{ fontSize: '1.125rem', marginTop: '0.25rem', opacity: 0.92 }}>
        {totalTickets} ticket{totalTickets === 1 ? '' : 's'}
        {result.childCount > 0
          ? ` (${result.adultCount} adult${result.adultCount === 1 ? '' : 's'}, ${result.childCount} child${result.childCount === 1 ? '' : 'ren'})`
          : ''}
      </div>
      <ShowLine showDate={result.showDate} showTime={result.showTime} venue={result.venue} />
      <img
        src={qrDataUrl}
        alt="Ticket QR code"
        style={{
          width: 'min(80vw, 320px)',
          height: 'auto',
          marginTop: '1.5rem',
          background: '#fff',
          padding: '0.5rem',
          borderRadius: '0.5rem',
        }}
      />
      <div
        style={{
          marginTop: '1.5rem',
          padding: '1rem 1.25rem',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '0.5rem',
          fontSize: '1rem',
          lineHeight: 1.4,
          maxWidth: '28rem',
        }}
      >
        Show this screen at the door.<br />
        <strong>Do not tap the QR again</strong>, it activates only when staff scans it.
      </div>
    </main>
  )
}

function UndoForm({ token }: { token: string }) {
  return (
    <form
      method="post"
      action={`/api/scan/${encodeURIComponent(token)}/undo`}
      style={{ marginTop: '2rem' }}
    >
      <button
        type="submit"
        style={{
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          border: '2px solid rgba(255,255,255,0.85)',
          borderRadius: '0.5rem',
          padding: '0.85rem 1.5rem',
          fontSize: '1.125rem',
          fontWeight: 600,
          cursor: 'pointer',
          minHeight: '48px',
          minWidth: '180px',
        }}
      >
        Undo scan
      </button>
    </form>
  )
}

function ResultView({
  result,
  qrDataUrl,
  token,
  viewer,
  undoRejected,
}: {
  result: ScanResult
  qrDataUrl?: string
  token: string
  viewer: ScanViewer
  undoRejected?: boolean
}) {
  if (result.status === 'BUYER_VIEW') {
    return <BuyerView result={result} qrDataUrl={qrDataUrl ?? ''} />
  }
  if (result.status === 'VALID') {
    return (
      <main style={{ background: '#0f7a3a', color: '#fff', ...wrapStyle }}>
        <div style={badgeStyle}>VALID</div>
        <div style={{ fontSize: '2.25rem', fontWeight: 700, marginTop: '1.5rem' }}>
          {result.buyerName}
        </div>
        <div style={{ fontSize: '1.5rem', marginTop: '0.5rem' }}>
          {result.adultCount + result.childCount} ticket
          {result.adultCount + result.childCount === 1 ? '' : 's'}
          {result.childCount > 0
            ? ` (${result.adultCount} adult${result.adultCount === 1 ? '' : 's'}, ${result.childCount} child${result.childCount === 1 ? '' : 'ren'})`
            : ''}
        </div>
        <ShowLine showDate={result.showDate} showTime={result.showTime} venue={result.venue} />
      </main>
    )
  }

  if (result.status === 'ALREADY_SCANNED') {
    const showUndo = viewer === 'staff' && canUndoScan(result.scannedAt)
    return (
      <main style={{ background: '#b46a00', color: '#fff', ...wrapStyle }}>
        <div style={badgeStyle}>ALREADY SCANNED</div>
        <div style={{ fontSize: '1.5rem', marginTop: '1.5rem' }}>
          First scanned at <strong>{formatScannedAt(result.scannedAt)}</strong>
        </div>
        <ShowLine showDate={result.showDate} showTime={result.showTime} venue={result.venue} />
        {showUndo && <UndoForm token={token} />}
        {undoRejected && (
          <div style={{ marginTop: '1rem', fontSize: '1rem', opacity: 0.9 }}>
            Undo window expired (2 minutes).
          </div>
        )}
      </main>
    )
  }

  return (
    <main style={{ background: '#b00020', color: '#fff', ...wrapStyle }}>
      <div style={badgeStyle}>INVALID</div>
      <div style={{ fontSize: '1.25rem', marginTop: '1.5rem' }}>
        This ticket is not recognised.
      </div>
    </main>
  )
}

const wrapStyle: React.CSSProperties = {
  minHeight: '100vh',
  padding: '2rem 1.5rem',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  textAlign: 'center',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

const badgeStyle: React.CSSProperties = {
  fontSize: '3rem',
  fontWeight: 800,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  padding: '0.75rem 1.5rem',
  border: '4px solid rgba(255,255,255,0.85)',
  borderRadius: '0.75rem',
}

async function resolveViewer(): Promise<ScanViewer> {
  try {
    const payload = await getPayload({ config })
    const h = await headers()
    const { user } = await payload.auth({ headers: h })
    const role = (user as { role?: string } | null)?.role
    if (role === 'superadmin' || role === 'admin' || role === 'tehnika') return 'staff'
  } catch {
    // fall through to buyer
  }
  return 'buyer'
}

export default async function ScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ undo?: string }>
}) {
  const { token } = await params
  const { undo } = await searchParams
  const viewer = await resolveViewer()
  const deps = await buildDeps()
  const result = await scanToken(token, deps, { viewer })
  const qrDataUrl =
    result.status === 'BUYER_VIEW'
      ? await QRCode.toDataURL(`https://moreska.eu/scan/${token}`, { margin: 1, width: 320 })
      : undefined
  return (
    <ResultView
      result={result}
      qrDataUrl={qrDataUrl}
      token={token}
      viewer={viewer}
      undoRejected={undo === 'rejected'}
    />
  )
}
