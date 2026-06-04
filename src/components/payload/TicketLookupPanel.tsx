'use client'

import { useCallback, useState, useTransition } from 'react'
import type { ScanResult } from '@/lib/scan-token'
import type { LookupMode, OrderLookupView } from '@/lib/order-lookup'
import { VENUE_LABEL, type Venue } from '@/lib/venues'

// Door-side manual-admit fallback (#245). When a guest's QR won't scan, the
// volunteer searches the active show by order code / email / name and admits the
// matched ticket with the SAME atomic mark-scanned as a QR scan. Tehnika is a
// Croatian-speaking door role and this panel renders only in their dashboard, so
// the copy is hard-coded Croatian rather than threaded through adminT.

const venueName = (v: string) => VENUE_LABEL.hr[v as Venue] ?? v

const MODE_LABEL: Record<LookupMode, string> = { code: 'Kod', email: 'E-pošta', name: 'Ime' }
const MODE_PLACEHOLDER: Record<LookupMode, string> = {
  code: 'npr. AB3K',
  email: 'kupac@primjer.com',
  name: 'Ime Prezime',
}

type LookupResponse =
  | { status: 'MATCH'; order: OrderLookupView }
  | { status: 'NOT_FOUND' }
  | { status: 'AMBIGUOUS'; count: number }

interface ScanResponse {
  token: string
  result: ScanResult
  undoEligible: boolean
}

interface Props {
  showId: string
}

function formatShowDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('hr-HR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatScannedAt(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('hr-HR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function partyLabel(adult: number, child: number): string {
  const parts: string[] = []
  if (adult > 0) parts.push(`${adult} odraslih`)
  if (child > 0) parts.push(`${child} djece`)
  return parts.join(', ') || '0'
}

// Croatian count form for "ulaznica": 1 → ulaznica, 2-4 → ulaznice, else ulaznica.
function ticketsWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'ulaznica'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'ulaznice'
  return 'ulaznica'
}

export function TicketLookupPanel({ showId }: Props) {
  const [mode, setMode] = useState<LookupMode>('code')
  const [query, setQuery] = useState('')
  const [match, setMatch] = useState<OrderLookupView | null>(null)
  // null = no search yet; '' = matched (no message); otherwise an info line.
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Scan/admit result card state — persists until the volunteer chooses an action.
  const [scan, setScan] = useState<ScanResponse | null>(null)
  const [admitting, setAdmitting] = useState(false)
  const [partyAdmitted, setPartyAdmitted] = useState<number | null>(null)
  const [undoState, setUndoState] = useState<'idle' | 'sending' | 'done' | 'rejected'>('idle')

  const resetAll = useCallback(() => {
    setMatch(null)
    setInfo(null)
    setError(null)
    setScan(null)
    setPartyAdmitted(null)
    setUndoState('idle')
    setQuery('')
  }, [])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setMatch(null)
    setScan(null)
    const q = query.trim()
    if (!q) return
    startTransition(async () => {
      try {
        const res = await fetch('/api/orders/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ showId, query: q, mode }),
        })
        const data = (await res.json()) as { result?: LookupResponse; error?: string }
        if (!res.ok) {
          setError(data.error ?? 'Pretraga nije uspjela')
          return
        }
        const result = data.result
        if (!result || result.status === 'NOT_FOUND') {
          setInfo('Nema naloga za ovu predstavu.')
        } else if (result.status === 'AMBIGUOUS') {
          setInfo(`Pronađeno ${result.count} naloga. Suzite pretragu ili upišite kod naloga.`)
        } else {
          setMatch(result.order)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pretraga nije uspjela')
      }
    })
  }

  // "Pusti" — admit one person with the same atomic mark-scanned as a QR scan.
  // Targets a real ticket (first unscanned, else the first ticket → resolves to
  // already-scanned). Never a ticketless open-door.
  const admitOne = useCallback(async (order: OrderLookupView) => {
    const target = order.tokens.find((t) => !t.scanned) ?? order.tokens[0]
    if (!target) {
      setError('Nalog nema važećih ulaznica.')
      return
    }
    setAdmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(target.token)}`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        setError('Propuštanje nije uspjelo.')
        return
      }
      const json = (await res.json()) as ScanResponse
      setScan(json)
      setUndoState('idle')
      setPartyAdmitted(null)
    } catch {
      setError('Propuštanje nije uspjelo.')
    } finally {
      setAdmitting(false)
    }
  }, [])

  const admitParty = useCallback(async () => {
    if (!scan) return
    setAdmitting(true)
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(scan.token)}/admit-party`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        setError('Propuštanje grupe nije uspjelo.')
        return
      }
      const json = (await res.json()) as { admitted: number }
      setPartyAdmitted(json.admitted)
    } catch {
      setError('Propuštanje grupe nije uspjelo.')
    } finally {
      setAdmitting(false)
    }
  }, [scan])

  const undo = useCallback(async () => {
    if (!scan) return
    setUndoState('sending')
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(scan.token)}/undo`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      setUndoState(res.ok ? 'done' : 'rejected')
    } catch {
      setUndoState('rejected')
    }
  }, [scan])

  // People in the party still to be admitted after the single "Pusti".
  const remainingToAdmit = match
    ? Math.max(0, match.partySize - match.scannedCount - 1)
    : 0

  return (
    <div style={panelStyle}>
      <h3 style={titleStyle}>Pronađi ulaznicu</h3>

      {/* Search form — hidden once we're showing a match or a result card. */}
      {!match && !scan && (
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
            {(['code', 'email', 'name'] as LookupMode[]).map((m) => (
              <label key={m} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {MODE_LABEL[m]}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={mode === 'email' ? 'email' : 'text'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={MODE_PLACEHOLDER[mode]}
              style={inputStyle}
              disabled={pending}
              autoComplete="off"
              autoCapitalize={mode === 'code' ? 'characters' : 'off'}
            />
            <button type="submit" disabled={pending || !query.trim()} style={buttonStyle}>
              {pending ? '…' : 'Traži'}
            </button>
          </div>
        </form>
      )}

      {error && <p style={errorStyle}>{error}</p>}
      {info && !match && !scan && <p style={infoStyle}>{info}</p>}

      {/* Match card (pre-admit): name + party + show + status, plus "Pusti". */}
      {match && !scan && (
        <div style={{ marginTop: 4 }}>
          <div style={matchCardStyle}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{match.buyerName}</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
              {partyLabel(match.adultCount, match.childCount)} · {match.partySize}{' '}
              {ticketsWord(match.partySize)}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              {formatShowDate(match.show.date)} · {match.show.time} ·{' '}
              {venueName(match.show.venue)}
            </div>
            <div style={{ fontSize: 13, marginTop: 6, fontWeight: 600 }}>
              {match.scannedCount >= match.partySize
                ? '✓ svi propušteni'
                : `${match.scannedCount} / ${match.partySize} propušteno`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => admitOne(match)}
              disabled={admitting}
              style={primaryActionStyle}
            >
              {admitting ? '…' : 'Pusti'}
            </button>
            <button type="button" onClick={resetAll} style={secondaryActionStyle}>
              Natrag
            </button>
          </div>
        </div>
      )}

      {/* Persistent scan/admit result card with the three peer actions. */}
      {scan && (
        <ResultCard
          scan={scan}
          remainingToAdmit={remainingToAdmit}
          partyAdmitted={partyAdmitted}
          admitting={admitting}
          undoState={undoState}
          onScanNew={resetAll}
          onAdmitParty={admitParty}
          onBack={() => {
            setScan(null)
            setPartyAdmitted(null)
            setUndoState('idle')
          }}
          onUndo={undo}
        />
      )}
    </div>
  )
}

function ResultCard({
  scan,
  remainingToAdmit,
  partyAdmitted,
  admitting,
  undoState,
  onScanNew,
  onAdmitParty,
  onBack,
  onUndo,
}: {
  scan: ScanResponse
  remainingToAdmit: number
  partyAdmitted: number | null
  admitting: boolean
  undoState: 'idle' | 'sending' | 'done' | 'rejected'
  onScanNew: () => void
  onAdmitParty: () => void
  onBack: () => void
  onUndo: () => void
}) {
  const { result, undoEligible } = scan
  const heading =
    result.status === 'VALID'
      ? 'PROPUŠTEN'
      : result.status === 'ALREADY_SCANNED'
        ? 'VEĆ PROPUŠTEN'
        : result.status === 'CANCELLED'
          ? 'STORNIRANO'
          : 'NEISPRAVNO'
  const bg =
    result.status === 'VALID'
      ? '#0f7a3a'
      : result.status === 'ALREADY_SCANNED'
        ? '#b46a00'
        : '#b00020'

  // Party-admit only makes sense once one person is in and the rest remain.
  const showPartyButton =
    result.status === 'VALID' && partyAdmitted === null && remainingToAdmit > 0

  return (
    <div style={{ ...resultCardStyle, background: bg }}>
      <div style={resultHeadingStyle}>{heading}</div>

      {result.status === 'VALID' && (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>{result.buyerName}</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
            {formatShowDate(result.showDate)} · {result.showTime} ·{' '}
            {venueName(result.venue)}
          </div>
        </>
      )}
      {result.status === 'ALREADY_SCANNED' && (
        <div style={{ fontSize: 13, marginTop: 8 }}>
          Prvi put propušten: <strong>{formatScannedAt(result.scannedAt)}</strong>
        </div>
      )}

      {partyAdmitted !== null && (
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>
          {partyAdmitted > 0 ? `Propušteno još ${partyAdmitted} iz grupe.` : 'Cijela grupa već propuštena.'}
        </div>
      )}

      {undoState === 'done' && (
        <p style={{ marginTop: 8, fontWeight: 600 }}>Propuštanje poništeno.</p>
      )}
      {undoState === 'rejected' && (
        <p style={{ marginTop: 8, opacity: 0.9 }}>Isteklo vrijeme za poništavanje (2 min).</p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={onScanNew} style={cardButtonLight}>
          Skeniraj novu
        </button>
        {showPartyButton && (
          <button type="button" onClick={onAdmitParty} disabled={admitting} style={cardButtonLight}>
            {admitting ? '…' : `Pusti cijelu grupu (${remainingToAdmit})`}
          </button>
        )}
        {result.status === 'ALREADY_SCANNED' && undoEligible && undoState === 'idle' && (
          <button type="button" onClick={onUndo} style={cardButtonLight}>
            Poništi propuštanje
          </button>
        )}
        {undoState === 'sending' && <span style={{ alignSelf: 'center' }}>Poništavam…</span>}
        <button type="button" onClick={onBack} style={cardButtonGhost}>
          Natrag
        </button>
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
  padding: 16,
}

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  margin: '0 0 8px',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  background: 'var(--theme-input-bg, var(--theme-bg))',
  color: 'var(--theme-text)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 4,
  fontSize: 14,
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--theme-elevation-100)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 4,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  color: 'var(--theme-text)',
}

const errorStyle: React.CSSProperties = {
  color: 'var(--theme-error-500, #c33)',
  fontSize: 13,
  margin: '8px 0 0',
}

const infoStyle: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.85,
  margin: '8px 0 0',
}

const matchCardStyle: React.CSSProperties = {
  padding: 12,
  background: 'var(--theme-bg)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
}

const primaryActionStyle: React.CSSProperties = {
  flex: 1,
  padding: '14px 16px',
  background: 'var(--theme-success-500, #1f7a3a)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 17,
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryActionStyle: React.CSSProperties = {
  padding: '14px 16px',
  background: 'var(--theme-elevation-100)',
  color: 'var(--theme-text)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}

const resultCardStyle: React.CSSProperties = {
  marginTop: 4,
  padding: '16px 16px 18px',
  borderRadius: 8,
  color: '#fff',
}

const resultHeadingStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: '0.04em',
}

const cardButtonLight: React.CSSProperties = {
  flex: '1 1 auto',
  padding: '12px 14px',
  background: '#fff',
  color: '#111',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

const cardButtonGhost: React.CSSProperties = {
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.15)',
  color: '#fff',
  border: '2px solid rgba(255,255,255,0.7)',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}
