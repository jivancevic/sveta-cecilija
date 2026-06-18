'use client'

import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

interface Preview {
  currentDate: string
  time: string
  buyerCount: number
  sampleEmails: string[]
}

type RescheduleResult =
  | { status: 'rescheduled'; oldDate: string; newDate: string; total: number; sent: number; failed: number }
  | { status: 'no-op'; date: string }
  | { status: 'date-mismatch' }

type TestResult = { status: 'test-sent'; to: string }

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

const dateInput: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 4,
  background: 'var(--theme-input-bg, #fff)',
  color: 'inherit',
  marginBottom: 10,
}

export function RescheduleShowMenuItem() {
  const { id, collectionSlug } = useDocumentInfo()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [newDate, setNewDate] = useState('')
  const [result, setResult] = useState<RescheduleResult | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (collectionSlug !== 'shows' || !id) return null

  const openPreview = async () => {
    setOpen(true)
    setLoading(true)
    setError(null)
    setResult(null)
    setTestResult(null)
    try {
      const res = await fetch(`/api/shows/${id}/reschedule`, { method: 'GET' })
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

  const post = async (test: boolean) => {
    if (!newDate) {
      setError('Pick a new date first.')
      return
    }
    setLoading(true)
    setError(null)
    setTestResult(null)
    try {
      const res = await fetch(`/api/shows/${id}/reschedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newDate, test }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || (test ? 'Test send failed.' : 'Reschedule failed.'))
      } else if (test) {
        setTestResult(data as TestResult)
      } else {
        setResult(data as RescheduleResult)
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
    setNewDate('')
    setResult(null)
    setTestResult(null)
    setError(null)
  }

  if (!open) {
    return (
      <button onClick={openPreview} style={labelStyle}>
        Reschedule show & notify buyers
      </button>
    )
  }

  return (
    <div style={{ padding: '10px 16px', minWidth: 300 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>Reschedule show</p>

      {loading && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-elevation-500)' }}>Working…</p>}

      {error && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-error-500, #e53e3e)' }}>{error}</p>
      )}

      {/* Final confirmation result */}
      {result && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          {result.status === 'rescheduled' && (
            <p style={{ margin: 0 }}>
              Rescheduled {result.oldDate} → {result.newDate}. Notified {result.sent} of {result.total} buyer
              {result.total === 1 ? '' : 's'}
              {result.failed > 0 ? `, ${result.failed} failed (see logs).` : '.'}
            </p>
          )}
          {result.status === 'no-op' && <p style={{ margin: 0 }}>That is already the show&apos;s date. Nothing changed.</p>}
          {result.status === 'date-mismatch' && (
            <p style={{ margin: 0 }}>The date changed in another tab. Reopen to try again. No email sent.</p>
          )}
          <button onClick={close} style={{ ...secondaryBtn, marginTop: 8 }}>Close</button>
        </div>
      )}

      {/* Preview + form (pre-confirm) */}
      {!result && preview && !loading && (
        <div style={{ fontSize: 12 }}>
          <p style={{ margin: '0 0 8px' }}>
            Currently <strong>{preview.currentDate}</strong> at {preview.time}.{' '}
            <strong>{preview.buyerCount}</strong> online buyer{preview.buyerCount === 1 ? '' : 's'} will be emailed.
          </p>
          {preview.sampleEmails.length > 0 && (
            <p style={{ margin: '0 0 10px', color: 'var(--theme-elevation-500)', wordBreak: 'break-all' }}>
              e.g. {preview.sampleEmails.join(', ')}
              {preview.buyerCount > preview.sampleEmails.length ? ', …' : ''}
            </p>
          )}
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>New date</label>
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={dateInput} />

          {testResult && (
            <p style={{ margin: '0 0 8px', color: 'var(--theme-success-500, #2f855a)' }}>
              Test sent to {testResult.to} (EN + HR). Check your inbox, then confirm.
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => post(true)} disabled={loading || !newDate} style={secondaryBtn}>
              Send test to me
            </button>
            <button onClick={() => post(false)} disabled={loading || !newDate} style={primaryBtn}>
              Confirm &amp; send to buyers
            </button>
            <button onClick={close} disabled={loading} style={secondaryBtn}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
