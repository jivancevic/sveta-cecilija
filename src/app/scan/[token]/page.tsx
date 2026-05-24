import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '@payload-config'
import { scanToken, type ScanDeps, type ScanResult } from '@/lib/scan-token'

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

function ResultView({ result }: { result: ScanResult }) {
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
    return (
      <main style={{ background: '#b46a00', color: '#fff', ...wrapStyle }}>
        <div style={badgeStyle}>ALREADY SCANNED</div>
        <div style={{ fontSize: '1.5rem', marginTop: '1.5rem' }}>
          First scanned at <strong>{formatScannedAt(result.scannedAt)}</strong>
        </div>
        <ShowLine showDate={result.showDate} showTime={result.showTime} venue={result.venue} />
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

export default async function ScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const deps = await buildDeps()
  const result = await scanToken(token, deps)
  return <ResultView result={result} />
}
