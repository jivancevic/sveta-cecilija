'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildScanStartArgs } from '@/lib/scan-camera'
import {
  extractScanToken,
  partyBreakdown,
  remainingAfterAdmit,
  resultChrome,
} from '@/lib/app/scan-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import type { LookupMode, OrderLookupView } from '@/lib/order-lookup'
import type { ScanResult } from '@/lib/scan-token'
import { VENUE_LABEL, type Venue } from '@/lib/venues'

// Skener's one client island (#504): the camera, the result card and the
// manual-admit search. Ported from `ScanStationClient.tsx` and
// `TicketLookupPanel.tsx`, which between them were the two halves of the door's
// old surface — one full-screen scanner at `/admin/scan`, one panel on the
// dashboard. Here they share one result card, because a guest admitted by hand
// and a guest admitted by QR are the same event and were being reported in two
// different visual languages.
//
// The scanning logic itself is untouched: the same `html5-qrcode` load with the
// iOS WASM ponyfill, the same `buildScanStartArgs` contract (a multi-key first
// argument makes html5-qrcode reject with a bare string), the same three routes.
//
// The card is ENGLISH and everything around it is Croatian (#476): the
// volunteer is Croatian, the guest reading over their shoulder is usually not.

const S = APP_STRINGS.scan

type Phase = 'closed' | 'starting' | 'live' | 'idle' | 'error'
type UndoState = 'idle' | 'sending' | 'done' | 'rejected'

interface ScanResponse {
  token: string
  result: ScanResult
  undoEligible: boolean
}

const MODE_LABEL: Record<LookupMode, string> = {
  code: S.modeCode,
  email: S.modeEmail,
  name: S.modeName,
}
const MODE_PLACEHOLDER: Record<LookupMode, string> = {
  code: S.placeholderCode,
  email: S.placeholderEmail,
  name: S.placeholderName,
}

const venueName = (v: string) => VENUE_LABEL.hr[v as Venue] ?? v

async function loadScanner() {
  // iOS Safari ships no native `BarcodeDetector`, so html5-qrcode silently
  // falls back to its bundled pure-JS ZXing port — markedly slower and less
  // tolerant of angle/blur than a native decoder. Install a WASM-backed
  // ponyfill (ZXing compiled to WebAssembly) so iOS gets the same fast path
  // Android already has. The polyfill only assigns `globalThis.BarcodeDetector`
  // when it's absent, so Android keeps its native detector and never downloads
  // the WASM.
  if (typeof window !== 'undefined' && !('BarcodeDetector' in window)) {
    const { setZXingModuleOverrides } = await import('barcode-detector/polyfill')
    // Self-host the WASM (committed at public/zxing/) so the door scanner never
    // depends on a third-party CDN at runtime — venue wifi is often locked
    // down. Must stay version-matched with the pinned `barcode-detector` dep.
    setZXingModuleOverrides({
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? '/zxing/zxing_reader.wasm' : `${prefix}${path}`,
    })
  }
  const mod = await import('html5-qrcode')
  return mod.Html5Qrcode
}

/** Both result dates are English: the card is the one thing the guest reads. */
function formatShowDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatScannedAt(iso: string): string {
  if (!iso) return ''
  // The timestamp arrives straight off the driver and is sometimes
  // `2026-09-13 00:11:02.324+02` rather than ISO. Node parses both; Safari
  // refuses the space form and renders "Invalid Date", which is exactly the
  // browser the door runs on.
  const d = new Date(iso.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/** Croatian count form for "ulaznica": 1 → ulaznica, 2-4 → ulaznice, else ulaznica. */
function ticketsWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'ulaznica'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'ulaznice'
  return 'ulaznica'
}

function partyLabel(adult: number, child: number): string {
  const parts: string[] = []
  if (adult > 0) parts.push(S.adults(adult))
  if (child > 0) parts.push(S.children(child))
  return parts.join(', ') || '0'
}

export function ScanStation({
  showId,
  canOpenOrder,
}: {
  /** Tonight's public performance, or null: the search has nothing to search. */
  showId: string | null
  /** The viewer holds `refunds`, so the card offers one link into the order. */
  canOpenOrder: boolean
}) {
  const [phase, setPhase] = useState<Phase>('closed')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [scan, setScan] = useState<ScanResponse | null>(null)
  const [undoState, setUndoState] = useState<UndoState>('idle')
  const [partyAdmitted, setPartyAdmitted] = useState<number | null>(null)
  const [admitting, setAdmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  /** How many of the party were still outside when this one was admitted. */
  const [partyRemaining, setPartyRemaining] = useState(0)

  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)
  const elementId = 'cecilija-scan-region'
  // Refs, so the decode callback's closure cannot go stale and re-post the same
  // token over and over while the QR is still in front of the lens.
  const processingRef = useRef(false)
  const lastTokenRef = useRef<string | null>(null)

  const stopCamera = useCallback(async () => {
    const inst = scannerRef.current
    scannerRef.current = null
    if (inst) {
      try {
        await inst.stop()
      } catch {
        // Already stopped, or the track is gone; nothing to do.
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      void stopCamera()
    }
  }, [stopCamera])

  // The overlay owns the viewport while it is open; the page behind it must not
  // scroll under the volunteer's thumb.
  useEffect(() => {
    if (phase === 'closed') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [phase])

  const handleDecoded = useCallback(async (decodedText: string) => {
    if (processingRef.current) return
    const token = extractScanToken(decodedText)
    if (!token) return
    if (lastTokenRef.current === token) return // same QR still in view
    processingRef.current = true
    lastTokenRef.current = token
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(token)}`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      const answer: ScanResponse = res.ok
        ? ((await res.json()) as ScanResponse)
        : { token, result: { status: 'INVALID' }, undoEligible: false }
      setScan(answer)
      setUndoState('idle')
      setPartyAdmitted(null)
      setActionError(null)
      setPartyRemaining(
        answer.result.status === 'VALID' ? answer.result.partyRemaining : 0,
      )
    } catch {
      setScan({ token, result: { status: 'INVALID' }, undoEligible: false })
    }
  }, [])

  // `auto` distinguishes the silent attempt made the moment the overlay opens
  // (a block falls back to the friendly "Tap to scan" screen, since most blocks
  // are just a missing user gesture) from an explicit tap (a block is a real
  // error and says so).
  const startCamera = useCallback(
    async (auto: boolean) => {
      setPhase('starting')
      setCameraError(null)
      try {
        const Html5Qrcode = await loadScanner()
        const instance = new Html5Qrcode(elementId)
        scannerRef.current = instance as unknown as { stop: () => Promise<void> }
        const shorter = Math.min(window.innerWidth, window.innerHeight)
        const boxSize = Math.min(Math.round(shorter * 0.6), 480)
        // Arg shape is load-bearing: html5-qrcode rejects a multi-key first arg
        // with a non-Error string. Built + unit-tested in `lib/scan-camera.ts`.
        const { cameraIdOrConfig, config } = buildScanStartArgs(boxSize)
        await instance.start(
          cameraIdOrConfig,
          config,
          (decodedText: string) => {
            void handleDecoded(decodedText)
          },
          () => undefined,
        )
        setPhase('live')
      } catch (err) {
        // The instance may exist but have failed to start; drop it so a retry
        // builds a clean one.
        scannerRef.current = null
        if (auto) {
          setPhase('idle')
          return
        }
        setPhase('error')
        // html5-qrcode (and some getUserMedia paths) reject with a plain
        // string, not an Error — surface it rather than a generic message, or a
        // real regression hides behind "camera unavailable" for a whole deploy.
        setCameraError(
          err instanceof Error
            ? err.message
            : typeof err === 'string' && err.trim()
              ? err
              : S.errorFallback,
        )
      }
    },
    [handleDecoded],
  )

  const openScanner = useCallback(() => {
    setScan(null)
    processingRef.current = false
    lastTokenRef.current = null
    void startCamera(true)
  }, [startCamera])

  const closeScanner = useCallback(async () => {
    await stopCamera()
    setPhase('closed')
    setScan(null)
    processingRef.current = false
    lastTokenRef.current = null
  }, [stopCamera])

  // "Scan the next one": fully restart the camera instead of resuming the open
  // stream. The decode loop runs fine across the result card, but a *resumed*
  // stream is slow to re-autofocus on the next close-up ticket, while a fresh
  // getUserMedia does an immediate focus/exposure sweep.
  const scanMore = useCallback(async () => {
    setScan(null)
    setUndoState('idle')
    setPartyAdmitted(null)
    setActionError(null)
    processingRef.current = false
    lastTokenRef.current = null
    await stopCamera()
    await startCamera(false)
  }, [stopCamera, startCamera])

  // `Accept: application/json` is load-bearing, not politeness (#504 review).
  // Without it the route answers 303 to `/scan/[token]`, `fetch` follows it,
  // and a staff GET of that page marks the ticket scanned again — the undo
  // undoes itself. The status is in the body because both outcomes are 200:
  // branching on `res.ok` reported a rejected undo as a successful one.
  const handleUndo = useCallback(async () => {
    if (!scan) return
    setUndoState('sending')
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(scan.token)}/undo`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        setUndoState('rejected')
        return
      }
      const json = (await res.json()) as { status?: string }
      setUndoState(json.status === 'UNDONE' ? 'done' : 'rejected')
    } catch {
      setUndoState('rejected')
    }
  }, [scan])

  const handleAdmitParty = useCallback(async () => {
    if (!scan) return
    setAdmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(scan.token)}/admit-party`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        setActionError(S.admitPartyFailed)
        return
      }
      const json = (await res.json()) as { admitted: number }
      setPartyAdmitted(json.admitted ?? 0)
    } catch {
      setActionError(S.admitPartyFailed)
    } finally {
      setAdmitting(false)
    }
  }, [scan])

  /** A manual admit from the search: the SAME atomic mark-scanned as a QR. */
  const admitFromLookup = useCallback(async (order: OrderLookupView) => {
    const target = order.tokens.find((t) => !t.scanned) ?? order.tokens[0]
    if (!target) {
      setActionError(S.noTickets)
      return
    }
    setAdmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(target.token)}`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        setActionError(S.admitFailed)
        return
      }
      const json = (await res.json()) as ScanResponse
      setScan(json)
      setUndoState('idle')
      setPartyAdmitted(null)
      setPartyRemaining(remainingAfterAdmit(order.partySize, order.scannedCount))
    } catch {
      setActionError(S.admitFailed)
    } finally {
      setAdmitting(false)
    }
  }, [])

  const card = scan ? (
    <ResultCard
      scan={scan}
      partyRemaining={partyRemaining}
      partyAdmitted={partyAdmitted}
      admitting={admitting}
      undoState={undoState}
      actionError={actionError}
      canOpenOrder={canOpenOrder}
      onAdmitParty={handleAdmitParty}
      onUndo={handleUndo}
      onDismiss={phase === 'closed' ? () => setScan(null) : scanMore}
      dismissLabel={phase === 'closed' ? S.back : S.scanMore}
    />
  ) : null

  return (
    <>
      <button type="button" className="app__scan-open" onClick={openScanner}>
        {S.open}
      </button>

      {/* On the page: the card of a manual admit, and the search itself. */}
      {phase === 'closed' && card}
      {phase === 'closed' && showId && (
        <LookupPanel
          showId={showId}
          admitting={admitting}
          onAdmit={admitFromLookup}
          hasResult={scan !== null}
        />
      )}

      {/* The scanner. Mounted only while open, so the camera region is never a
          hidden element html5-qrcode might attach to twice.

          `data-no-pull`: the camera covers the screen, so a finger dragged down
          it is aiming at a ticket and not at a refresh (#562). */}
      {phase !== 'closed' && (
        <div className="app__scan-overlay" data-no-pull>
          <div id={elementId} className="app__scan-video" />

          {phase === 'idle' && (
            <div className="app__scan-screen">
              <h2>{S.idleTitle}</h2>
              <p>{S.idleBody}</p>
              <button
                type="button"
                className="app__scan-cta"
                onClick={() => void startCamera(false)}
              >
                {S.idleAction}
              </button>
              <button type="button" className="app__scan-quiet" onClick={() => void closeScanner()}>
                {S.close}
              </button>
            </div>
          )}

          {phase === 'error' && (
            <div className="app__scan-screen">
              <h2>{S.errorTitle}</h2>
              <p className="app__scan-errmsg">{cameraError ?? S.errorFallback}</p>
              <button
                type="button"
                className="app__scan-cta"
                onClick={() => void startCamera(false)}
              >
                {S.retry}
              </button>
              <button type="button" className="app__scan-quiet" onClick={() => void closeScanner()}>
                {S.close}
              </button>
            </div>
          )}

          {(phase === 'live' || phase === 'starting') && (
            <>
              <div className="app__scan-aim" aria-hidden />
              {!scan && (
                <button
                  type="button"
                  className="app__scan-exit"
                  onClick={() => void closeScanner()}
                >
                  {S.close}
                </button>
              )}
              {phase === 'starting' && <p className="app__scan-status">{S.starting}</p>}
            </>
          )}

          {/* The result card persists over the viewfinder until it is tapped
              away, so nobody is admitted by a QR that drifted back into frame. */}
          {card && <div className="app__scan-cardwrap">{card}</div>}
        </div>
      )}
    </>
  )
}

function ResultCard({
  scan,
  partyRemaining,
  partyAdmitted,
  admitting,
  undoState,
  actionError,
  canOpenOrder,
  onAdmitParty,
  onUndo,
  onDismiss,
  dismissLabel,
}: {
  scan: ScanResponse
  partyRemaining: number
  partyAdmitted: number | null
  admitting: boolean
  undoState: UndoState
  actionError: string | null
  canOpenOrder: boolean
  onAdmitParty: () => void
  onUndo: () => void
  onDismiss: () => void
  dismissLabel: string
}) {
  const { result, undoEligible } = scan
  const { heading, variant } = resultChrome(result.status)
  const orderId = 'orderId' in result ? result.orderId : null

  return (
    <section className={`app__scan-result app__scan-result--${variant}`} aria-live="assertive">
      <p className="app__scan-heading">{heading}</p>

      {result.status === 'VALID' && (
        <>
          <p className="app__scan-name">{result.buyerName}</p>
          <p className="app__scan-party">{partyBreakdown(result.adultCount, result.childCount)}</p>
          <p className="app__scan-meta">
            {formatShowDate(result.showDate)} · {result.showTime} · {venueName(result.venue)}
          </p>
        </>
      )}

      {result.status === 'ALREADY_SCANNED' && (
        <>
          <p className="app__scan-party">
            {APP_STRINGS.scan.result.firstScanned} <strong>{formatScannedAt(result.scannedAt)}</strong>
          </p>
          <p className="app__scan-meta">
            {formatShowDate(result.showDate)} · {result.showTime} · {venueName(result.venue)}
          </p>
        </>
      )}

      {result.status === 'CANCELLED' && (
        <>
          <p className="app__scan-party">
            {result.cancelReason === 'refund'
              ? APP_STRINGS.scan.result.voidedRefund
              : result.cancelReason === 'storno'
                ? APP_STRINGS.scan.result.voidedStorno
                : `${APP_STRINGS.scan.result.voided}.`}
          </p>
          <p className="app__scan-meta">
            {formatShowDate(result.showDate)} · {result.showTime} · {venueName(result.venue)}
          </p>
        </>
      )}

      {result.status === 'INVALID' && (
        <p className="app__scan-party">{APP_STRINGS.scan.result.unknown}</p>
      )}

      {partyAdmitted !== null && <p className="app__scan-note">{S.admittedParty(partyAdmitted)}</p>}
      {undoState === 'sending' && <p className="app__scan-note">{S.undoing}</p>}
      {undoState === 'done' && <p className="app__scan-note">{S.undone}</p>}
      {undoState === 'rejected' && <p className="app__scan-note">{S.undoExpired}</p>}
      {actionError && <p className="app__scan-note">{actionError}</p>}

      <div className="app__scan-actions">
        {result.status === 'VALID' && partyAdmitted === null && partyRemaining > 0 && (
          <button
            type="button"
            className="app__scan-action"
            onClick={onAdmitParty}
            disabled={admitting}
          >
            {admitting ? S.admitting : S.admitParty(partyRemaining)}
          </button>
        )}

        {result.status === 'ALREADY_SCANNED' && undoEligible && undoState === 'idle' && (
          <button type="button" className="app__scan-action" onClick={onUndo}>
            {S.undo}
          </button>
        )}

        <button type="button" className="app__scan-action app__scan-action--ghost" onClick={onDismiss}>
          {dismissLabel}
        </button>

        {/* One link, never a refund button: a refund is an action inside an
            order (#476). The Narudžbe screen is #501; until it lands this 404s,
            which is accepted. */}
        {canOpenOrder && orderId && (
          <Link className="app__scan-action app__scan-action--ghost" href={`/app/orders/${orderId}`}>
            {S.openOrder}
          </Link>
        )}
      </div>
    </section>
  )
}

function LookupPanel({
  showId,
  admitting,
  onAdmit,
  hasResult,
}: {
  showId: string
  admitting: boolean
  onAdmit: (order: OrderLookupView) => void
  hasResult: boolean
}) {
  const [mode, setMode] = useState<LookupMode>('code')
  const [query, setQuery] = useState('')
  const [match, setMatch] = useState<OrderLookupView | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const reset = useCallback(() => {
    setMatch(null)
    setInfo(null)
    setQuery('')
  }, [])

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const q = query.trim()
      if (!q) return
      setPending(true)
      setInfo(null)
      setMatch(null)
      try {
        const res = await fetch('/api/orders/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ showId, query: q, mode }),
        })
        const data = (await res.json()) as {
          result?:
            | { status: 'MATCH'; order: OrderLookupView }
            | { status: 'NOT_FOUND' }
            | { status: 'AMBIGUOUS'; count: number }
          error?: string
        }
        if (!res.ok) {
          setInfo(data.error ?? S.searchFailed)
          return
        }
        const result = data.result
        if (!result || result.status === 'NOT_FOUND') setInfo(S.notFound)
        else if (result.status === 'AMBIGUOUS') setInfo(S.ambiguous(result.count))
        else setMatch(result.order)
      } catch {
        setInfo(S.searchFailed)
      } finally {
        setPending(false)
      }
    },
    [mode, query, showId],
  )

  // A result card is on the page: the search that produced it stays out of the
  // way until the volunteer dismisses it.
  if (hasResult) return null

  return (
    <section className="app__scan-lookup">
      <h2>{S.lookupTitle}</h2>
      <p className="app__scan-lookup-intro">{S.lookupIntro}</p>

      {!match && (
        <form onSubmit={submit}>
          <div className="app__scan-modes" role="group" aria-label={S.lookupTitle}>
            {(['code', 'email', 'name'] as LookupMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`app__scan-mode${mode === m ? ' app__scan-mode--on' : ''}`}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <div className="app__scan-search">
            <input
              type={mode === 'email' ? 'email' : 'text'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={MODE_PLACEHOLDER[mode]}
              disabled={pending}
              autoComplete="off"
              autoCapitalize={mode === 'code' ? 'characters' : 'off'}
              aria-label={MODE_LABEL[mode]}
            />
            <button type="submit" disabled={pending || !query.trim()}>
              {pending ? S.searching : S.search}
            </button>
          </div>
        </form>
      )}

      {info && !match && <p className="app__scan-info">{info}</p>}

      {match && (
        <div className="app__scan-match">
          <p className="app__scan-match-name">{match.buyerName}</p>
          <p className="app__scan-match-party">
            {partyLabel(match.adultCount, match.childCount)} · {match.partySize}{' '}
            {ticketsWord(match.partySize)}
          </p>
          <p className="app__scan-match-meta">
            {match.show.time} · {venueName(match.show.venue)}
          </p>
          <p className="app__scan-match-state">
            {match.scannedCount >= match.partySize
              ? S.allAdmitted
              : S.admittedOf(match.scannedCount, match.partySize)}
          </p>
          <div className="app__scan-actions">
            <button
              type="button"
              className="app__scan-action"
              onClick={() => onAdmit(match)}
              disabled={admitting}
            >
              {admitting ? S.admitting : S.admit}
            </button>
            <button
              type="button"
              className="app__scan-action app__scan-action--ghost"
              onClick={reset}
            >
              {S.back}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
