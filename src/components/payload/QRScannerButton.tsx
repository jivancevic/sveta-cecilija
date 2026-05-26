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

export function QRScannerButton() {
  const [mode, setMode] = useState<Mode>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)
  const elementId = 'tehnika-qr-scanner-region'

  useEffect(() => {
    return () => {
      const inst = scannerRef.current
      if (inst) {
        inst.stop().catch(() => undefined)
      }
    }
  }, [])

  // Lock background scroll while the fullscreen overlay is open. iOS Safari
  // otherwise lets a swipe drag the page behind the camera.
  useEffect(() => {
    if (mode !== 'scanning' && mode !== 'starting') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mode])

  async function startScanning() {
    setMode('starting')
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
      <button
        type="button"
        onClick={stopScanning}
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
        Cancel
      </button>
      {mode === 'starting' ? (
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
          Starting camera…
        </p>
      ) : null}
    </div>
  )
}
