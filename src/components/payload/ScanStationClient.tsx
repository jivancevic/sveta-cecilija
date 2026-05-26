'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScanResult } from '@/lib/scan-token'

type Phase = 'idle' | 'starting' | 'live' | 'showing' | 'error'

const VENUE_NAME: Record<string, string> = {
  'ljetno-kino': 'Ljetno kino',
  'zimsko-kino': 'Centar za kulturu',
}

const VALID_AUTO_DISMISS_MS = 3000

interface ScanResponse {
  token: string
  result: ScanResult
  undoEligible: boolean
}

async function loadScanner() {
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

export function ScanStationClient() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [response, setResponse] = useState<ScanResponse | null>(null)
  const [undoState, setUndoState] = useState<'idle' | 'sending' | 'done' | 'rejected'>('idle')

  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)
  const elementId = 'tehnika-qr-scanner-region'
  // Refs to avoid the closure inside the decode callback going stale and
  // re-posting the same token repeatedly.
  const processingRef = useRef(false)
  const lastTokenRef = useRef<string | null>(null)
  const autoDismissTimer = useRef<number | null>(null)

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
      if (autoDismissTimer.current) window.clearTimeout(autoDismissTimer.current)
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

  const dismissResult = useCallback(() => {
    if (autoDismissTimer.current) {
      window.clearTimeout(autoDismissTimer.current)
      autoDismissTimer.current = null
    }
    setResponse(null)
    setUndoState('idle')
    processingRef.current = false
    lastTokenRef.current = null
    setPhase('live')
  }, [])

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
        if (json.result.status === 'VALID') {
          autoDismissTimer.current = window.setTimeout(dismissResult, VALID_AUTO_DISMISS_MS)
        }
      }
    } catch {
      setResponse({ token, result: { status: 'INVALID' }, undoEligible: false })
    }
  }, [dismissResult])

  const startCamera = useCallback(async () => {
    setPhase('starting')
    setErrorMsg(null)
    try {
      const Html5Qrcode = await loadScanner()
      const instance = new Html5Qrcode(elementId)
      scannerRef.current = instance as unknown as { stop: () => Promise<void>; clear: () => void }
      const shorter = Math.min(window.innerWidth, window.innerHeight)
      const boxSize = Math.min(Math.round(shorter * 0.6), 480)
      await instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: boxSize, height: boxSize } },
        (decodedText: string) => {
          void handleDecoded(decodedText)
        },
        () => undefined,
      )
      setPhase('live')
    } catch (err) {
      setPhase('error')
      const message = err instanceof Error ? err.message : 'Camera unavailable'
      setErrorMsg(message)
    }
  }, [handleDecoded])

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

      {phase === 'idle' && <IdleStart onStart={startCamera} />}
      {phase === 'error' && <ErrorView message={errorMsg} onRetry={startCamera} onExit={exitToAdmin} />}
      {(phase === 'live' || phase === 'starting' || phase === 'showing') && (
        <>
          <AimTarget />
          <ExitButton onClick={exitToAdmin} />
          {phase === 'starting' && <StatusLine text="Starting camera…" />}
        </>
      )}
      {phase === 'showing' && response && (
        <ResultOverlay
          response={response}
          undoState={undoState}
          onUndo={handleUndo}
          onScanNew={dismissResult}
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
      <h1 style={{ fontSize: 26, margin: '0 0 12px' }}>Door scan</h1>
      <p style={{ fontSize: 14, color: '#bbb', maxWidth: 320, margin: '0 0 32px' }}>
        Tap below to open the camera. Your phone will ask for permission once.
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
        Scan a ticket
      </button>
      <a
        href="/admin"
        style={{
          marginTop: 24,
          color: '#888',
          textDecoration: 'underline',
          fontSize: 14,
        }}
      >
        Back to dashboard
      </a>
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

function ResultOverlay({
  response,
  undoState,
  onUndo,
  onScanNew,
}: {
  response: ScanResponse
  undoState: 'idle' | 'sending' | 'done' | 'rejected'
  onUndo: () => void
  onScanNew: () => void
}) {
  const { result, undoEligible } = response
  const bg =
    result.status === 'VALID'
      ? '#0f7a3a'
      : result.status === 'ALREADY_SCANNED'
        ? '#b46a00'
        : '#b00020'

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
        {result.status === 'VALID'
          ? 'VALID'
          : result.status === 'ALREADY_SCANNED'
            ? 'ALREADY SCANNED'
            : 'INVALID'}
      </div>

      {result.status === 'VALID' && (
        <>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '1.25rem' }}>
            {result.buyerName}
          </div>
          <div style={{ fontSize: '1.25rem', marginTop: '0.5rem' }}>
            {result.adultCount + result.childCount} ticket
            {result.adultCount + result.childCount === 1 ? '' : 's'}
            {result.childCount > 0
              ? ` (${result.adultCount} adult${result.adultCount === 1 ? '' : 's'}, ${result.childCount} child${result.childCount === 1 ? '' : 'ren'})`
              : ''}
          </div>
          <div style={{ fontSize: '1rem', marginTop: '0.75rem', opacity: 0.9 }}>
            {formatShowDate(result.showDate)} · {result.showTime} ·{' '}
            {VENUE_NAME[result.venue] ?? result.venue}
          </div>
          <p style={{ marginTop: '1.5rem', fontSize: '0.95rem', opacity: 0.85 }}>
            Resuming in a moment…
          </p>
          <button
            type="button"
            onClick={onScanNew}
            style={{
              marginTop: '0.5rem',
              padding: '0.7rem 1.4rem',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '2px solid rgba(255,255,255,0.7)',
              borderRadius: 8,
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Scan new now
          </button>
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
          {undoEligible && undoState === 'idle' && (
            <button
              type="button"
              onClick={onUndo}
              style={{
                marginTop: '1.25rem',
                width: 'min(80vw, 320px)',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: '2px solid rgba(255,255,255,0.85)',
                borderRadius: 8,
                padding: '0.85rem 1.5rem',
                fontSize: '1.05rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Undo scan
            </button>
          )}
          {undoState === 'sending' && (
            <p style={{ marginTop: '1rem', opacity: 0.85 }}>Undoing…</p>
          )}
          {undoState === 'done' && (
            <p style={{ marginTop: '1rem', fontWeight: 600 }}>Scan undone.</p>
          )}
          {undoState === 'rejected' && (
            <p style={{ marginTop: '1rem', opacity: 0.85 }}>Undo window expired (2 minutes).</p>
          )}
          <button
            type="button"
            onClick={onScanNew}
            style={{
              marginTop: '1.25rem',
              width: 'min(80vw, 320px)',
              background: '#fff',
              color: '#111',
              border: 'none',
              borderRadius: 8,
              padding: '0.85rem 1.5rem',
              fontSize: '1.05rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Scan new
          </button>
        </>
      )}

      {result.status === 'INVALID' && (
        <>
          <div style={{ fontSize: '1.15rem', marginTop: '1.25rem' }}>
            This ticket is not recognised.
          </div>
          <button
            type="button"
            onClick={onScanNew}
            style={{
              marginTop: '1.5rem',
              width: 'min(80vw, 320px)',
              background: '#fff',
              color: '#111',
              border: 'none',
              borderRadius: 8,
              padding: '0.85rem 1.5rem',
              fontSize: '1.05rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Scan new
          </button>
        </>
      )}
    </div>
  )
}
