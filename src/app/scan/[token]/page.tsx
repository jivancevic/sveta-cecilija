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
import { maskEmail } from '@/lib/claim/claim-order'

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
        UPDATE tickets
        SET scanned = true,
            scanned_at = NOW(),
            updated_at = NOW()
        WHERE token = ${token} AND scanned = false AND status = 'active'
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
        FROM tickets
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
    findTicket: async (token) => {
      const res: any = await drizzle.execute(sql`
        SELECT order_id, scanned, scanned_at, status, cancel_reason
        FROM tickets
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
      return {
        orderId: String(row.order_id),
        scanned: Boolean(row.scanned),
        scannedAt,
        status: row.status === 'cancelled' ? 'cancelled' : 'active',
        cancelReason:
          row.cancel_reason === 'storno' || row.cancel_reason === 'refund'
            ? row.cancel_reason
            : null,
      }
    },
    findOrderDetails: async (orderId) => {
      try {
        const doc = await payload.findByID({ collection: 'orders', id: orderId, depth: 0 })
        return {
          buyerName: (doc.buyerName as string) ?? '',
          adultCount: (doc.adultCount as number) ?? 0,
          childCount: (doc.childCount as number) ?? 0,
          showId: String(doc.show),
          email: (doc.email as string | null) ?? null,
          code: (doc.code as string | null) ?? null,
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
  claimState,
}: {
  result: Extract<ScanResult, { status: 'BUYER_VIEW' }>
  qrDataUrl: string
  claimState?: 'success' | 'error'
}) {
  const totalTickets = result.adultCount + result.childCount
  const claimed = result.email != null
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
      {claimState === 'success' && (
        <div style={{ ...claimBanner, background: '#0f7a3a' }}>
          Ticket sent. Check your email for the PDF.
        </div>
      )}
      {claimState === 'error' && (
        <div style={{ ...claimBanner, background: '#b46a00' }}>
          Sorry, we couldn’t send your ticket. Please check your details and try again.
        </div>
      )}
      <div style={{ fontSize: '0.875rem', letterSpacing: '0.1em', opacity: 0.7, textTransform: 'uppercase' }}>
        Your ticket
      </div>
      {result.code && (
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '1.25rem', letterSpacing: '0.15em', marginTop: '0.5rem' }}>
          {result.code}
        </div>
      )}
      {claimed && result.buyerName && (
        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem' }}>{result.buyerName}</div>
      )}
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
      {claimed ? (
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
          <div style={{ marginTop: '0.75rem', opacity: 0.7, fontSize: '0.9rem' }}>
            Claimed by {maskEmail(result.email as string)}
          </div>
        </div>
      ) : (
        <ClaimForm token={result.token} />
      )}
    </main>
  )
}

const claimBanner: React.CSSProperties = {
  width: '100%',
  maxWidth: '28rem',
  marginBottom: '1rem',
  padding: '0.85rem 1rem',
  borderRadius: '0.5rem',
  fontSize: '1rem',
  fontWeight: 600,
}

// Unclaimed partner ticket: the guest attaches their email to receive the PDF.
// Plain server-rendered form POST (the scan page is a server component); the
// claim route does the race-safe first-claimer-wins attach + emails the PDF.
function ClaimForm({ token }: { token: string }) {
  const input: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem 0.9rem',
    fontSize: '1rem',
    borderRadius: '0.5rem',
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    marginTop: '0.6rem',
    boxSizing: 'border-box',
  }
  return (
    <form
      method="post"
      action={`/api/scan/${encodeURIComponent(token)}/claim`}
      style={{ marginTop: '1.75rem', width: '100%', maxWidth: '24rem' }}
    >
      <div style={{ fontSize: '1rem', opacity: 0.92, marginBottom: '0.25rem' }}>
        Enter your details to get your ticket by email.
      </div>
      <input name="name" placeholder="Your name" required maxLength={120} style={input} />
      <input name="email" type="email" placeholder="Your email" required maxLength={200} style={input} />
      <div style={{ fontSize: '0.8125rem', opacity: 0.7, marginTop: '0.5rem', lineHeight: 1.45 }}>
        We&rsquo;ll email your ticket, any changes to the show, and one short follow-up after the
        performance. You can opt out at any time.
      </div>
      <button
        type="submit"
        style={{
          width: '100%',
          marginTop: '0.85rem',
          background: '#fff',
          color: '#111',
          border: '2px solid #fff',
          borderRadius: '0.5rem',
          padding: '0.85rem 1.5rem',
          fontSize: '1.0625rem',
          fontWeight: 700,
          cursor: 'pointer',
          minHeight: '48px',
        }}
      >
        Get my ticket
      </button>
    </form>
  )
}

function UndoForm({ token }: { token: string }) {
  return (
    <form
      method="post"
      action={`/api/scan/${encodeURIComponent(token)}/undo`}
      style={{ marginTop: '2rem', width: '100%', maxWidth: '24rem' }}
    >
      <button
        type="submit"
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          border: '2px solid rgba(255,255,255,0.85)',
          borderRadius: '0.5rem',
          padding: '0.85rem 1.5rem',
          fontSize: '1.125rem',
          fontWeight: 600,
          cursor: 'pointer',
          minHeight: '48px',
        }}
      >
        Undo scan
      </button>
    </form>
  )
}

function PartyAdmitForm({ token }: { token: string }) {
  return (
    <form
      method="post"
      action={`/api/scan/${encodeURIComponent(token)}/admit-party`}
      style={{ marginTop: '1.5rem', width: '100%', maxWidth: '24rem' }}
    >
      {/* No count in the label: this person is already admitted by the scan
          that surfaced this screen, and the page doesn't know how many other
          siblings are already in. The post-admit banner reports the true
          number newly admitted. */}
      <button
        type="submit"
        style={{
          width: '100%',
          background: '#fff',
          color: '#0f7a3a',
          border: '2px solid #fff',
          borderRadius: '0.5rem',
          padding: '0.85rem 1.5rem',
          fontSize: '1.125rem',
          fontWeight: 700,
          cursor: 'pointer',
          minHeight: '48px',
        }}
      >
        Admit rest of party
      </button>
    </form>
  )
}

function StaffActions() {
  const baseBtn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: '48px',
    padding: '0.85rem 1.25rem',
    fontSize: '1.0625rem',
    fontWeight: 600,
    borderRadius: '0.5rem',
    textDecoration: 'none',
    boxSizing: 'border-box',
  }
  const primary: React.CSSProperties = {
    ...baseBtn,
    background: '#fff',
    color: '#111',
    border: '2px solid #fff',
  }
  const secondary: React.CSSProperties = {
    ...baseBtn,
    background: 'transparent',
    color: '#fff',
    border: '2px solid rgba(255,255,255,0.6)',
  }
  return (
    <div
      style={{
        marginTop: '2rem',
        width: '100%',
        maxWidth: '24rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <a href="/admin/scan" style={primary}>Scan new</a>
      <a href="/admin" style={secondary}>Back</a>
    </div>
  )
}

function ResultView({
  result,
  qrDataUrl,
  token,
  viewer,
  undoRejected,
  partyAdmitted,
  claimState,
}: {
  result: ScanResult
  qrDataUrl?: string
  token: string
  viewer: ScanViewer
  undoRejected?: boolean
  partyAdmitted?: number
  claimState?: 'success' | 'error'
}) {
  if (result.status === 'BUYER_VIEW') {
    return <BuyerView result={result} qrDataUrl={qrDataUrl ?? ''} claimState={claimState} />
  }
  if (result.status === 'VALID') {
    const partySize = result.adultCount + result.childCount
    return (
      <main style={{ background: '#0f7a3a', color: '#fff', ...wrapStyle }}>
        <div style={badgeStyle}>VALID</div>
        <div style={{ fontSize: '2.25rem', fontWeight: 700, marginTop: '1.5rem' }}>
          {result.buyerName}
        </div>
        <div style={{ fontSize: '1.5rem', marginTop: '0.5rem' }}>
          {partySize} ticket
          {partySize === 1 ? '' : 's'}
          {result.childCount > 0
            ? ` (${result.adultCount} adult${result.adultCount === 1 ? '' : 's'}, ${result.childCount} child${result.childCount === 1 ? '' : 'ren'})`
            : ''}
        </div>
        <ShowLine showDate={result.showDate} showTime={result.showTime} venue={result.venue} />
        {/* Each scan admits one person; offer to walk in the rest of the party. */}
        {viewer === 'staff' && partySize > 1 && <PartyAdmitForm token={token} />}
        {viewer === 'staff' && <StaffActions />}
      </main>
    )
  }

  if (result.status === 'CANCELLED') {
    return (
      <main style={{ background: '#4a4a4a', color: '#fff', ...wrapStyle }}>
        <div style={badgeStyle}>CANCELLED</div>
        <div style={{ fontSize: '1.5rem', marginTop: '1.5rem' }}>
          This ticket was voided{result.cancelReason === 'refund' ? ' (refunded)' : result.cancelReason === 'storno' ? ' (storno)' : ''}. Do not admit.
        </div>
        <ShowLine showDate={result.showDate} showTime={result.showTime} venue={result.venue} />
        {viewer === 'staff' && <StaffActions />}
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
        {viewer === 'staff' && partyAdmitted !== undefined && (
          <div style={{ marginTop: '1rem', fontSize: '1.25rem', fontWeight: 700 }}>
            {partyAdmitted > 0
              ? `Admitted ${partyAdmitted} more — full party is in.`
              : 'Rest of the party was already scanned.'}
          </div>
        )}
        <ShowLine showDate={result.showDate} showTime={result.showTime} venue={result.venue} />
        {showUndo && <UndoForm token={token} />}
        {undoRejected && (
          <div style={{ marginTop: '1rem', fontSize: '1rem', opacity: 0.9 }}>
            Undo window expired (2 minutes).
          </div>
        )}
        {viewer === 'staff' && <StaffActions />}
      </main>
    )
  }

  return (
    <main style={{ background: '#b00020', color: '#fff', ...wrapStyle }}>
      <div style={badgeStyle}>INVALID</div>
      <div style={{ fontSize: '1.25rem', marginTop: '1.5rem' }}>
        This ticket is not recognised.
      </div>
      {viewer === 'staff' && <StaffActions />}
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
  searchParams: Promise<{ undo?: string; party?: string; claimed?: string; claim?: string }>
}) {
  const { token } = await params
  const { undo, party, claimed, claim } = await searchParams
  const viewer = await resolveViewer()
  const deps = await buildDeps()
  const result = await scanToken(token, deps, { viewer })
  const qrDataUrl =
    result.status === 'BUYER_VIEW'
      ? await QRCode.toDataURL(`https://moreska.eu/scan/${token}`, { margin: 1, width: 320 })
      : undefined
  const partyAdmitted =
    party !== undefined && /^\d+$/.test(party) ? Number(party) : undefined
  const claimState: 'success' | 'error' | undefined =
    claimed === '1' ? 'success' : claim === 'error' ? 'error' : undefined
  return (
    <ResultView
      result={result}
      qrDataUrl={qrDataUrl}
      token={token}
      viewer={viewer}
      undoRejected={undo === 'rejected'}
      partyAdmitted={partyAdmitted}
      claimState={claimState}
    />
  )
}
