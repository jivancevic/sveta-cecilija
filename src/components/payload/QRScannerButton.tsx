'use client'

import { useEffect, useRef, useState } from 'react'

type Mode = 'idle' | 'starting' | 'scanning' | 'error'

// html5-qrcode is ~150KB; only loaded the first time the user taps the button
// so admin/superadmin sessions (which never scan) pay zero cost.
async function loadScanner() {
  const mod = await import('html5-qrcode')
  return mod.Html5Qrcode
}

// QR codes encode https://moreska.eu/scan/<token>. Accept that, the bare
// /scan/<token> path, or just the raw token (defensive — some QR readers strip
// the host).
function extractScanPath(decoded: string): string | null {
  if (!decoded) return null
  const trimmed = decoded.trim()
  try {
    const url = new URL(trimmed)
    const match = url.pathname.match(/^\/scan\/([^/?#]+)\/?$/)
    if (match) return `/scan/${match[1]}`
  } catch {
    // not a URL — fall through
  }
  const pathMatch = trimmed.match(/^\/?scan\/([^/?#]+)\/?$/)
  if (pathMatch) return `/scan/${pathMatch[1]}`
  if (/^[A-Za-z0-9_-]{8,}$/.test(trimmed)) return `/scan/${trimmed}`
  return null
}

export function QRScannerButton({ autoStart = false }: { autoStart?: boolean } = {}) {
  const [mode, setMode] = useState<Mode>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)
  const autoStartedRef = useRef(false)
  const elementId = 'tehnika-qr-scanner-region'

  useEffect(() => {
    return () => {
      const inst = scannerRef.current
      if (inst) {
        inst.stop().catch(() => undefined)
      }
    }
  }, [])

  useEffect(() => {
    if (autoStart && !autoStartedRef.current) {
      autoStartedRef.current = true
      // fire-and-forget; startScanning handles its own error state
      void startScanning()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  async function startScanning() {
    setMode('starting')
    setErrorMsg(null)
    try {
      const Html5Qrcode = await loadScanner()
      const instance = new Html5Qrcode(elementId)
      scannerRef.current = instance as unknown as { stop: () => Promise<void>; clear: () => void }
      await instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          const target = extractScanPath(decodedText)
          if (!target) return // ignore non-ticket QRs; keep scanning
          try {
            await instance.stop()
          } catch {
            // ignore stop errors; we're navigating away
          }
          window.location.href = target
        },
        () => undefined, // per-frame decode failures: ignored
      )
      setMode('scanning')
    } catch (err) {
      setMode('error')
      const message = err instanceof Error ? err.message : 'Camera unavailable'
      setErrorMsg(message)
    }
  }

  async function stopScanning() {
    const inst = scannerRef.current
    if (inst) {
      try {
        await inst.stop()
      } catch {
        // ignore
      }
    }
    setMode('idle')
  }

  if (mode === 'idle' || mode === 'error') {
    return (
      <div>
        <button
          type="button"
          onClick={startScanning}
          style={{
            display: 'block',
            width: '100%',
            padding: '20px 16px',
            fontSize: 18,
            fontWeight: 700,
            background: 'var(--theme-success-500, #1f7a3a)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Scan a ticket
        </button>
        <p style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginTop: 8 }}>
          Your phone will ask permission to use the camera. Tap Allow.
        </p>
        {mode === 'error' && errorMsg ? (
          <p style={{ color: 'var(--theme-error-500, #c0392b)', fontSize: 13, marginTop: 8 }}>
            Camera error: {errorMsg}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      <div
        id={elementId}
        style={{
          width: '100%',
          maxWidth: 480,
          aspectRatio: '1 / 1',
          background: 'black',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      />
      <button
        type="button"
        onClick={stopScanning}
        style={{
          marginTop: 12,
          padding: '10px 16px',
          background: 'var(--theme-elevation-100)',
          color: 'var(--theme-text)',
          border: '1px solid var(--theme-elevation-200)',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
      {mode === 'starting' ? (
        <p style={{ fontSize: 13, color: 'var(--theme-elevation-500)', marginTop: 8 }}>
          Starting camera…
        </p>
      ) : null}
    </div>
  )
}
