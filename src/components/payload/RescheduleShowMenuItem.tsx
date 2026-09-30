'use client'

import React, { useState } from 'react'
import { RESCHEDULE_ACTION_LABEL } from '@/lib/show-schedule-lock'
import { useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useSalesActionsVisible } from './useSalesActionsVisible'

interface Preview {
  currentDate: string
  time: string
  buyerCount: number
  sampleEmails: string[]
}

// The route's own answer, imported rather than re-typed (#688 review): it was
// spelled out here and in Cecilija's sheet, so widening it for the hour meant
// editing one union in three files. A type-only import costs nothing at runtime.
import type { RescheduleResult } from '@/lib/show-reschedule'

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
  const { id } = useDocumentInfo()
  const visible = useSalesActionsVisible()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [result, setResult] = useState<RescheduleResult | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A non-public performance has no buyers to notify (#409); move its date or
  // its hour by editing the field instead.
  if (!visible) return null

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
    // Either half, or both (#688). An empty field is sent as absent rather than
    // echoed back from the row: echoing is how a caller overwrites an hour
    // somebody else moved between the preview and the confirm.
    if (!newDate && !newTime) {
      setError('Pick a new date, a new time, or both.')
      return
    }
    setLoading(true)
    setError(null)
    setTestResult(null)
    try {
      const res = await fetch(`/api/shows/${id}/reschedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(newDate ? { newDate } : {}),
          ...(newTime ? { newTime } : {}),
          test,
        }),
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
    setNewTime('')
    setResult(null)
    setTestResult(null)
    setError(null)
  }

  if (!open) {
    return (
      <button onClick={openPreview} style={labelStyle}>
        {/* The one spelling of this label: the #689 refusal names it back. */}
        {RESCHEDULE_ACTION_LABEL}
      </button>
    )
  }

  return (
    <div style={{ padding: '10px 16px', minWidth: 300 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>Move show date/time</p>

      {loading && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-elevation-500)' }}>Working…</p>}

      {error && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-error-500, #e53e3e)' }}>{error}</p>
      )}

      {/* Final confirmation result */}
      {result && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          {result.status === 'rescheduled' && (
            <>
              <p style={{ margin: 0 }}>
                Moved {result.oldDate} {result.oldTime} → {result.newDate} {result.newTime}. Notified{' '}
                {result.sent} of {result.total} buyer
                {result.total === 1 ? '' : 's'}
                {result.failed > 0 ? `, ${result.failed} failed (see logs).` : '.'}
              </p>
              {/* Reissue is per ORDER, so this count can exceed the buyer count
                  (one person, several orders). A failure here means someone is
                  still holding a PDF with the old schedule — resend it from the
                  order's "Resend ticket email" action. */}
              <p style={{ margin: '4px 0 0' }}>
                Reissued {result.reissued} ticket{result.reissued === 1 ? '' : 's'} with the new
                schedule
                {result.reissueFailed > 0
                  ? `, ${result.reissueFailed} failed (resend from the order, see logs).`
                  : '.'}
              </p>
            </>
          )}
          {result.status === 'no-op' && (
            <p style={{ margin: 0 }}>That is already the show&apos;s schedule. Nothing changed.</p>
          )}
          {result.status === 'schedule-mismatch' && (
            <p style={{ margin: 0 }}>
              The date or time changed in another tab. Reopen to try again. No email sent.
            </p>
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

          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>New start time</label>
          <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={dateInput} />
          <p style={{ margin: '0 0 10px', color: 'var(--theme-elevation-500)' }}>
            Leave either field empty to keep it as it is.
          </p>

          {testResult && (
            <p style={{ margin: '0 0 8px', color: 'var(--theme-success-500, #2f855a)' }}>
              Test sent to {testResult.to} (EN + HR). Check your inbox, then confirm.
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => post(true)} disabled={loading || (!newDate && !newTime)} style={secondaryBtn}>
              Send test to me
            </button>
            <button onClick={() => post(false)} disabled={loading || (!newDate && !newTime)} style={primaryBtn}>
              Confirm &amp; send to buyers
            </button>
            <button onClick={close} disabled={loading} style={secondaryBtn}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
