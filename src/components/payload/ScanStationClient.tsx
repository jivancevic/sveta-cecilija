'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ScanResult } from '@/lib/scan-token'
import { buildScanStartArgs } from '@/lib/scan-camera'

type Phase = 'idle' | 'starting' | 'live' | 'showing' | 'error'

const VENUE_NAME: Record<string, string> = {
  'ljetno-kino': 'Ljetno kino',
  'zimsko-kino': 'Centar za kulturu',
}

interface ScanResponse {
  token: string
  result: ScanResult
  undoEligible: boolean
}

type UndoState = 'idle' | 'sending' | 'done' | 'rejected'
type AdmitState = { status: 'idle' | 'sending' | 'done' | 'error'; admitted: number }

async function loadScanner() {
  // iOS Safari ships no native `BarcodeDetector`, so html5-qrcode silently
  // falls back to its bundled pure-JS ZXing port — markedly slower and less
  // tolerant of angle/blur than a native decoder. Install a WASM-backed
  // ponyfill (ZXing compiled to WebAssembly) so iOS gets the same fast path
  // Android already has. The polyfill only assigns `globalThis.BarcodeDetector`
  // when it's absent, so Android keeps its native detector and never downloads
  // the WASM. Gated on the same `in window` check the ponyfill uses internally.
  if (typeof window !== 'undefined' && !('BarcodeDetector' in window)) {
    const { setZXingModuleOverrides } = await import('barcode-detector/polyfill')
    // Self-host the WASM (committed at public/zxing/, copied from the pinned
    // zxing-wasm build) so the door scanner never depends on a third-party CDN
    // at runtime — venue wifi is often locked down. Must stay version-matched
    // with the pinned `barcode-detector` dep; the default would fetch jsDelivr.
    setZXingModuleOverrides({
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? '/zxing/zxing_reader.wasm' : `${prefix}${path}`,
    })
  }
  const mod = await import('html5-qrcode')
  return mod.Html5Qrcode
}

function extractScanPath(decoded: string): string | null {
  if (!decoded) return null
  const trimmed = decoded.trim()
  try {
    const url = new URL(trimmed)
    const match = url.pathname.match(/^\/scan\/([^/?#]+)\/?$/)
    if (match) return match[1] ?? null
  } catch {
    // not a URL
  }
  const pathMatch = trimmed.match(/^\/?scan\/([^/?#]+)\/?$/)
  if (pathMatch) return pathMatch[1] ?? null
  if (/^[A-Za-z0-9_-]{8,}$/.test(trimmed)) return trimmed
  return null
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

function formatShowDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function partyBreakdown(adultCount: number, childCount: number): string {
  const total = adultCount + childCount
  const base = `${total} ticket${total === 1 ? '' : 's'}`
  if (childCount > 0 && adultCount > 0) {
    return `${base} — ${adultCount} adult${adultCount === 1 ? '' : 's'}, ${childCount} child${childCount === 1 ? '' : 'ren'}`
  }
  if (childCount > 0) {
    return `${base} — ${childCount} child${childCount === 1 ? '' : 'ren'}`
  }
  return `${base} — ${adultCount} adult${adultCount === 1 ? '' : 's'}`
}

export function ScanStationClient() {
  const [phase, setPhase] = useState<Phase>('starting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [response, setResponse] = useState<ScanResponse | null>(null)
  const [undoState, setUndoState] = useState<UndoState>('idle')
  const [admitState, setAdmitState] = useState<AdmitState>({ status: 'idle', admitted: 0 })

  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)
  const elementId = 'tehnika-qr-scanner-region'
  // Refs to avoid the closure inside the decode callback going stale and
  // re-posting the same token repeatedly.
  const processingRef = useRef(false)
  const lastTokenRef = useRef<string | null>(null)
  // Guards the one-shot auto-start attempt on mount so React strict-mode's
  // double-invoke (or a re-render) can't open the camera twice.
  const autoStartedRef = useRef(false)

  const stopCamera = useCallback(async () => {
    const inst = scannerRef.current
    scannerRef.current = null
    if (inst) {
      try {
        await inst.stop()
      } catch {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      void stopCamera()
    }
  }, [stopCamera])

  useEffect(() => {
    if (phase !== 'live' && phase !== 'starting' && phase !== 'showing') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [phase])

  const handleDecoded = useCallback(async (decodedText: string) => {
    if (processingRef.current) return
    const token = extractScanPath(decodedText)
    if (!token) return
    if (lastTokenRef.current === token) return // same QR still in view; ignore
    processingRef.current = true
    lastTokenRef.current = token
    setPhase('showing')
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(token)}`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        setResponse({ token, result: { status: 'INVALID' }, undoEligible: false })
      } else {
        const json = (await res.json()) as ScanResponse
        setResponse(json)
      }
    } catch {
      setResponse({ token, result: { status: 'INVALID' }, undoEligible: false })
    }
  }, [])

  // `auto` distinguishes the silent on-mount attempt (a block falls back to the
  // friendly "Tap to scan" screen, since most blocks are just the missing user
  // gesture, e.g. iOS Safari) from an explicit tap (a block is a real error).
  const startCamera = useCallback(
    async (auto = false) => {
      setPhase('starting')
      setErrorMsg(null)
      try {
        const Html5Qrcode = await loadScanner()
        const instance = new Html5Qrcode(elementId)
        scannerRef.current = instance as unknown as { stop: () => Promise<void>; clear: () => void }
        const shorter = Math.min(window.innerWidth, window.innerHeight)
        const boxSize = Math.min(Math.round(shorter * 0.6), 480)
        // Arg shape is load-bearing: html5-qrcode rejects a multi-key first arg
        // with a non-Error string ("Camera unavailable"). Built + unit-tested in
        // src/lib/scan-camera.ts so that contract can't silently regress again.
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
        // The instance may have been created but failed to start; drop it so a
        // retry builds a clean one.
        scannerRef.current = null
        if (auto) {
          // Likely just needs a user gesture — show the one-tap fallback, not a
          // scary error.
          setPhase('idle')
          return
        }
        setPhase('error')
        // html5-qrcode (and some getUserMedia paths) reject with a plain
        // string, not an Error — surface it instead of a generic message so the
        // real cause is visible (a generic "Camera unavailable" masked the
        // PR #290 single-key regression for a whole deploy cycle).
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'string' && err.trim()
              ? err
              : 'Camera unavailable'
        setErrorMsg(message)
      }
    },
    [handleDecoded],
  )

  // "Scan more": fully restart the camera instead of resuming the open stream.
  // The decode loop runs fine across the result overlay (measured: constant
  // scan rate while covered/uncovered), but a *resumed* continuous stream is
  // slow to re-autofocus on the next close-up ticket, while a fresh
  // getUserMedia does an immediate focus/exposure sweep — which is exactly why
  // Exit→re-enter scans instantly. Mirror that path. lastTokenRef can reset
  // since the restart gives a fresh stream before the next ticket arrives.
  const dismissResult = useCallback(async () => {
    setResponse(null)
    setUndoState('idle')
    setAdmitState({ status: 'idle', admitted: 0 })
    processingRef.current = false
    lastTokenRef.current = null
    await stopCamera()
    await startCamera(false)
  }, [stopCamera, startCamera])

  // One-tap entry: try to open the camera the moment the view mounts so the
  // dashboard button lands straight in scanning. No "Door scan" intro screen.
  useEffect(() => {
    if (autoStartedRef.current) return
    autoStartedRef.current = true
    void startCamera(true)
  }, [startCamera])

  const handleUndo = useCallback(async () => {
    if (!response) return
    setUndoState('sending')
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(response.token)}/undo`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      setUndoState(res.ok ? 'done' : 'rejected')
    } catch {
      setUndoState('rejected')
    }
  }, [response])

  const handleAdmitParty = useCallback(async () => {
    if (!response) return
    setAdmitState({ status: 'sending', admitted: 0 })
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(response.token)}/admit-party`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        setAdmitState({ status: 'error', admitted: 0 })
        return
      }
      const json = (await res.json()) as { admitted: number }
      setAdmitState({ status: 'done', admitted: json.admitted ?? 0 })
    } catch {
      setAdmitState({ status: 'error', admitted: 0 })
    }
  }, [response])

  const exitToAdmin = useCallback(async () => {
    await stopCamera()
    window.location.href = '/admin'
  }, [stopCamera])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
      }}
    >
      <div
        id={elementId}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />

      {phase === 'idle' && <IdleStart onStart={() => startCamera(false)} />}
      {phase === 'error' && (
        <ErrorView message={errorMsg} onRetry={() => startCamera(false)} onExit={exitToAdmin} />
      )}
      {(phase === 'live' || phase === 'starting' || phase === 'showing') && (
        <>
          <AimTarget />
          {phase !== 'showing' && <ExitButton onClick={exitToAdmin} />}
          {phase === 'starting' && <StatusLine text="Starting camera…" />}
        </>
      )}
      {phase === 'showing' && response && (
        <ResultOverlay
          response={response}
          undoState={undoState}
          admitState={admitState}
          onUndo={handleUndo}
          onAdmitParty={handleAdmitParty}
          onScanMore={dismissResult}
          onExit={exitToAdmin}
        />
      )}
    </div>
  )
}

function IdleStart({ onStart }: { onStart: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#0a0a0a',
        color: '#fff',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 26, margin: '0 0 12px' }}>Ready to scan</h1>
      <p style={{ fontSize: 14, color: '#bbb', maxWidth: 320, margin: '0 0 32px' }}>
        Tap below to open the camera. Your phone may ask for permission the first time.
      </p>
      <button
        type="button"
        onClick={onStart}
        style={{
          width: 'min(86vw, 360px)',
          padding: '24px 16px',
          fontSize: 20,
          fontWeight: 700,
          background: '#1f7a3a',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          cursor: 'pointer',
        }}
      >
        Tap to scan
      </button>
      <Link
        href="/admin"
        prefetch={false}
        style={{
          marginTop: 24,
          color: '#888',
          textDecoration: 'underline',
          fontSize: 14,
        }}
      >
        Back to dashboard
      </Link>
    </div>
  )
}

function ErrorView({
  message,
  onRetry,
  onExit,
}: {
  message: string | null
  onRetry: () => void
  onExit: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#0a0a0a',
        color: '#fff',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>Camera error</h1>
      <p style={{ fontSize: 14, color: '#f88', maxWidth: 320, margin: '0 0 24px' }}>
        {message ?? 'Camera unavailable'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '14px 24px',
          background: '#fff',
          color: '#111',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
      <button
        type="button"
        onClick={onExit}
        style={{
          marginTop: 16,
          background: 'transparent',
          color: '#888',
          border: 'none',
          textDecoration: 'underline',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        Back to dashboard
      </button>
    </div>
  )
}

function AimTarget() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(60vmin, 480px)',
        height: 'min(60vmin, 480px)',
        border: '2px solid rgba(255,255,255,0.85)',
        borderRadius: 12,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
      }}
    />
  )
}

function ExitButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute',
        top: 'max(env(safe-area-inset-top, 0px), 16px)',
        right: 16,
        padding: '10px 18px',
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.5)',
        borderRadius: 999,
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Exit
    </button>
  )
}

function StatusLine({ text }: { text: string }) {
  return (
    <p
      style={{
        position: 'absolute',
        bottom: 'max(env(safe-area-inset-bottom, 0px), 24px)',
        left: 0,
        right: 0,
        textAlign: 'center',
        color: '#fff',
        fontSize: 14,
      }}
    >
      {text}
    </p>
  )
}

const primaryBtnStyle: React.CSSProperties = {
  width: 'min(80vw, 340px)',
  background: '#fff',
  color: '#111',
  border: 'none',
  borderRadius: 8,
  padding: '0.95rem 1.5rem',
  fontSize: '1.1rem',
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryBtnStyle: React.CSSProperties = {
  width: 'min(80vw, 340px)',
  background: 'rgba(255,255,255,0.15)',
  color: '#fff',
  border: '2px solid rgba(255,255,255,0.85)',
  borderRadius: 8,
  padding: '0.85rem 1.5rem',
  fontSize: '1.05rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const actionColStyle: React.CSSProperties = {
  marginTop: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.75rem',
}

// Result-screen chrome per status: backdrop colour + uppercase heading.
const STATUS_META: Record<string, { bg: string; heading: string }> = {
  VALID: { bg: '#0f7a3a', heading: 'VALID' },
  ALREADY_SCANNED: { bg: '#b46a00', heading: 'ALREADY SCANNED' },
  CANCELLED: { bg: '#5a5a5a', heading: 'CANCELLED' },
  INVALID: { bg: '#b00020', heading: 'INVALID' },
}

// Bottom action stack shared by every result screen: any status-specific
// content (admit / undo), then the always-present "Scan more" + "Exit" pair.
// `scanMorePrimary` makes "Scan more" the prominent button when there's no
// other primary action above it (i.e. everything but VALID).
function ActionRow({
  scanMorePrimary,
  onScanMore,
  onExit,
  children,
}: {
  scanMorePrimary: boolean
  onScanMore: () => void
  onExit: () => void
  children?: React.ReactNode
}) {
  return (
    <div style={actionColStyle}>
      {children}
      <button
        type="button"
        onClick={onScanMore}
        style={scanMorePrimary ? primaryBtnStyle : secondaryBtnStyle}
      >
        Scan more
      </button>
      <button type="button" onClick={onExit} style={secondaryBtnStyle}>
        Exit
      </button>
    </div>
  )
}

function ResultOverlay({
  response,
  undoState,
  admitState,
  onUndo,
  onAdmitParty,
  onScanMore,
  onExit,
}: {
  response: ScanResponse
  undoState: UndoState
  admitState: AdmitState
  onUndo: () => void
  onAdmitParty: () => void
  onScanMore: () => void
  onExit: () => void
}) {
  const { result, undoEligible } = response
  const { bg, heading } = STATUS_META[result.status] ?? STATUS_META.INVALID

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: bg,
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: '2.4rem',
          fontWeight: 800,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          padding: '0.6rem 1.4rem',
          border: '4px solid rgba(255,255,255,0.85)',
          borderRadius: '0.75rem',
        }}
      >
        {heading}
      </div>

      {result.status === 'VALID' && (
        <>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '1.25rem' }}>
            {result.buyerName}
          </div>
          <div style={{ fontSize: '1.25rem', marginTop: '0.5rem' }}>
            {partyBreakdown(result.adultCount, result.childCount)}
          </div>
          <div style={{ fontSize: '1rem', marginTop: '0.75rem', opacity: 0.9 }}>
            {formatShowDate(result.showDate)} · {result.showTime} ·{' '}
            {VENUE_NAME[result.venue] ?? result.venue}
          </div>

          <ActionRow scanMorePrimary={false} onScanMore={onScanMore} onExit={onExit}>
            {admitState.status === 'done' ? (
              <p style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>
                {admitState.admitted > 0
                  ? `Admitted ${admitState.admitted} more ${admitState.admitted === 1 ? 'person' : 'people'}.`
                  : 'No one left to admit.'}
              </p>
            ) : (
              result.partyRemaining > 0 && (
                <button
                  type="button"
                  onClick={onAdmitParty}
                  disabled={admitState.status === 'sending'}
                  style={{
                    ...primaryBtnStyle,
                    opacity: admitState.status === 'sending' ? 0.7 : 1,
                  }}
                >
                  {admitState.status === 'sending'
                    ? 'Admitting…'
                    : `Admit rest of party (${result.partyRemaining})`}
                </button>
              )
            )}
            {admitState.status === 'error' && (
              <p style={{ margin: 0, opacity: 0.9 }}>Could not admit the rest. Try again.</p>
            )}
          </ActionRow>
        </>
      )}

      {result.status === 'ALREADY_SCANNED' && (
        <>
          <div style={{ fontSize: '1.25rem', marginTop: '1.25rem' }}>
            First scanned at <strong>{formatScannedAt(result.scannedAt)}</strong>
          </div>
          <div style={{ fontSize: '1rem', marginTop: '0.75rem', opacity: 0.9 }}>
            {formatShowDate(result.showDate)} · {result.showTime} ·{' '}
            {VENUE_NAME[result.venue] ?? result.venue}
          </div>

          <ActionRow scanMorePrimary onScanMore={onScanMore} onExit={onExit}>
            {undoEligible && undoState === 'idle' && (
              <button type="button" onClick={onUndo} style={secondaryBtnStyle}>
                Undo scan
              </button>
            )}
            {undoState === 'sending' && <p style={{ margin: 0, opacity: 0.85 }}>Undoing…</p>}
            {undoState === 'done' && <p style={{ margin: 0, fontWeight: 600 }}>Scan undone.</p>}
            {undoState === 'rejected' && (
              <p style={{ margin: 0, opacity: 0.85 }}>Undo window expired (2 minutes).</p>
            )}
          </ActionRow>
        </>
      )}

      {result.status === 'CANCELLED' && (
        <>
          <div style={{ fontSize: '1.15rem', marginTop: '1.25rem' }}>
            This ticket has been voided
            {result.cancelReason === 'refund'
              ? ' (refunded)'
              : result.cancelReason === 'storno'
                ? ' (cancelled)'
                : ''}
            .
          </div>
          <div style={{ fontSize: '1rem', marginTop: '0.75rem', opacity: 0.9 }}>
            {formatShowDate(result.showDate)} · {result.showTime} ·{' '}
            {VENUE_NAME[result.venue] ?? result.venue}
          </div>
          <ActionRow scanMorePrimary onScanMore={onScanMore} onExit={onExit} />
        </>
      )}

      {result.status === 'INVALID' && (
        <>
          <div style={{ fontSize: '1.15rem', marginTop: '1.25rem' }}>
            This ticket is not recognised.
          </div>
          <ActionRow scanMorePrimary onScanMore={onScanMore} onExit={onExit} />
        </>
      )}
    </div>
  )
}
