'use client'

import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

interface Preview {
  alreadyMoved: boolean
  venue: string
  venueChangedAt: string | null
  buyerCount: number
  sampleEmails: string[]
}

type MoveResult =
  | { status: 'moved'; total: number; sent: number; failed: number }
  | { status: 'already-moved'; venueChangedAt: string | null }
  | { status: 'not-applicable'; venue: string }

const labelStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 16px',
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 14,
  color: 'inherit',
}

const primaryBtn: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--theme-warning-500, #d69e2e)',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const secondaryBtn: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--theme-elevation-100)',
  color: 'inherit',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
}

export function MarkMovedToZimskoMenuItem() {
  const { id, collectionSlug } = useDocumentInfo()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<MoveResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (collectionSlug !== 'shows' || !id) return null

  const openPreview = async () => {
    setOpen(true)
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/shows/${id}/move-to-zimsko`, { method: 'GET' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not load preview.')
      } else {
        setPreview(data as Preview)
      }
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  const confirm = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/shows/${id}/move-to-zimsko`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Move failed.')
      } else {
        setResult(data as MoveResult)
        router.refresh()
      }
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  const close = () => {
    setOpen(false)
    setPreview(null)
    setResult(null)
    setError(null)
  }

  if (!open) {
    return (
      <button onClick={openPreview} style={labelStyle}>
        Mark show as moved to Zimsko
      </button>
    )
  }

  const notApplicable = preview && !preview.alreadyMoved && preview.venue !== 'ljetno-kino'

  return (
    <div style={{ padding: '10px 16px', minWidth: 280 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>Move to Zimsko (Centar za kulturu)</p>

      {loading && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-elevation-500)' }}>Working…</p>}

      {error && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-error-500, #e53e3e)' }}>{error}</p>
      )}

      {/* Confirmation result */}
      {result && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          {result.status === 'moved' && (
            <p style={{ margin: 0 }}>
              Venue moved. Notified {result.sent} of {result.total} buyer{result.total === 1 ? '' : 's'}
              {result.failed > 0 ? `, ${result.failed} failed (see logs).` : '.'}
            </p>
          )}
          {result.status === 'already-moved' && <p style={{ margin: 0 }}>Show was already moved. No email sent.</p>}
          {result.status === 'not-applicable' && <p style={{ margin: 0 }}>This show is not at Ljetno, so nothing to move.</p>}
          <button onClick={close} style={{ ...secondaryBtn, marginTop: 8 }}>Close</button>
        </div>
      )}

      {/* Preview (pre-confirm) */}
      {!result && preview && !loading && (
        <div style={{ fontSize: 12 }}>
          {preview.alreadyMoved ? (
            <>
              <p style={{ margin: '0 0 8px' }}>
                Already moved on{' '}
                {preview.venueChangedAt ? new Date(preview.venueChangedAt).toLocaleString() : 'a previous date'}. No
                email will be re-sent.
              </p>
              <button onClick={close} style={secondaryBtn}>Close</button>
            </>
          ) : notApplicable ? (
            <>
              <p style={{ margin: '0 0 8px' }}>This show is already at Zimsko, so there is nothing to move.</p>
              <button onClick={close} style={secondaryBtn}>Close</button>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 6px' }}>
                <strong>{preview.buyerCount}</strong> online buyer{preview.buyerCount === 1 ? '' : 's'} will be emailed
                about the venue change. The venue will flip to Zimsko and the change is logged.
              </p>
              {preview.sampleEmails.length > 0 && (
                <p style={{ margin: '0 0 10px', color: 'var(--theme-elevation-500)', wordBreak: 'break-all' }}>
                  e.g. {preview.sampleEmails.join(', ')}
                  {preview.buyerCount > preview.sampleEmails.length ? ', …' : ''}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={confirm} disabled={loading} style={primaryBtn}>
                  Confirm &amp; send
                </button>
                <button onClick={close} disabled={loading} style={secondaryBtn}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
