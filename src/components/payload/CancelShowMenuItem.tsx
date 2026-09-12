'use client'

import React, { useState } from 'react'
import { useAuth, useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useSalesActionsVisible } from './useSalesActionsVisible'

// "Cancel performance, refund and notify every buyer" (#497). Mirrors
// RescheduleShowMenuItem: open → preview what it will cost and who hears about
// it → optional test send to yourself → confirm.
//
// Until #497 this item was a bare PATCH that flipped `status` and nothing else,
// which left every ticket active and every buyer uninformed. The button now
// drives /api/shows/[id]/cancel, which refunds online orders through the shared
// idempotent engine, voids partner and comp seats as a storno, and mails
// everyone with an address on file. Pressing it again after a partial failure is
// safe and is the documented fix: the route skips what is already done.

interface Preview {
  alreadyCancelled: boolean
  date: string
  time: string
  onlineOrders: number
  refundCents: number
  partnerOrders: number
  partnerSeats: number
  compOrders: number
  compSeats: number
  toNotify: number
  noEmail: number
  sampleEmails: string[]
  overDailyMailLimit: boolean
  dailyMailLimit: number
}

interface CancelResult {
  status: 'cancelled' | 'already-cancelled'
  date: string
  orders: number
  refunded: number
  refundedCents: number
  refundFailed: number
  voided: number
  notified: number
  notifyFailed: number
  noEmail: number
}

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
  color: 'var(--theme-error-500, #e53e3e)',
}

const dangerBtn: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--theme-error-500, #e53e3e)',
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

const muted: React.CSSProperties = { color: 'var(--theme-elevation-500)' }

function eur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`
}

export function CancelShowMenuItem() {
  const { id } = useDocumentInfo()
  const { user } = useAuth()
  const visible = useSalesActionsVisible()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<CancelResult | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // On a non-public performance there is nothing to withdraw from /tickets and
  // nobody to tell: cancel it by setting the status field instead (#409).
  if (!visible) return null

  // Client-side `refunds` gate, and UX only: /api/users/me hides `permissions`
  // from anyone who does not hold `users`, so an absent list means "unknown",
  // not "denied" (the same reasoning as useInviteVisible). When the list IS
  // visible and carries no `refunds`, say so rather than letting the route 403.
  const permissions = (user as { permissions?: unknown } | null | undefined)?.permissions
  const knownPermissions = Array.isArray(permissions) ? (permissions as string[]) : null
  const mayRefund = knownPermissions === null || knownPermissions.includes('refunds')

  const openPreview = async () => {
    setOpen(true)
    setLoading(true)
    setError(null)
    setResult(null)
    setTestResult(null)
    try {
      const res = await fetch(`/api/shows/${id}/cancel`, { method: 'GET' })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Could not load preview.')
      else setPreview(data as Preview)
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  const post = async (test: boolean) => {
    setLoading(true)
    setError(null)
    setTestResult(null)
    try {
      const res = await fetch(`/api/shows/${id}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || (test ? 'Test send failed.' : 'Cancellation failed.'))
      } else if (test) {
        setTestResult(data as TestResult)
      } else {
        setResult(data as CancelResult)
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
    setTestResult(null)
    setError(null)
  }

  if (!open) {
    return (
      <button onClick={openPreview} style={labelStyle}>
        Cancel show, refund &amp; notify buyers
      </button>
    )
  }

  return (
    <div style={{ padding: '10px 16px', minWidth: 320 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>Cancel performance</p>

      {loading && <p style={{ margin: '0 0 8px', fontSize: 12, ...muted }}>Working…</p>}

      {error && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-error-500, #e53e3e)' }}>{error}</p>
      )}

      {/* Outcome */}
      {result && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          <p style={{ margin: 0 }}>
            {result.status === 'cancelled' ? 'Cancelled' : 'Was already cancelled'} ({result.date}).
            Refunded {result.refunded} order{result.refunded === 1 ? '' : 's'} ({eur(result.refundedCents)}),
            voided {result.voided} partner/comp ticket{result.voided === 1 ? '' : 's'},
            emailed {result.notified} buyer{result.notified === 1 ? '' : 's'}.
          </p>
          {(result.refundFailed > 0 || result.notifyFailed > 0) && (
            <p style={{ margin: '6px 0 0', color: 'var(--theme-error-500, #e53e3e)' }}>
              {result.refundFailed > 0 && `${result.refundFailed} refund(s) failed. `}
              {result.notifyFailed > 0 && `${result.notifyFailed} email(s) failed. `}
              Run this action again: it skips everything already done and retries only these.
            </p>
          )}
          <button onClick={close} style={{ ...secondaryBtn, marginTop: 8 }}>Close</button>
        </div>
      )}

      {/* Preview + confirm */}
      {!result && preview && !loading && (
        <div style={{ fontSize: 12 }}>
          {preview.alreadyCancelled && (
            <p style={{ margin: '0 0 8px', color: 'var(--theme-warning-500, #d69e2e)' }}>
              This performance is already cancelled. Running the action now finishes any refunds and
              emails an earlier attempt did not get to.
            </p>
          )}
          <p style={{ margin: '0 0 6px' }}>
            <strong>{preview.date}</strong> at {preview.time}. This cannot be undone.
          </p>
          <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
            <li>
              Refund <strong>{eur(preview.refundCents)}</strong> across {preview.onlineOrders} online order
              {preview.onlineOrders === 1 ? '' : 's'}
            </li>
            <li>
              Void {preview.partnerSeats} partner seat{preview.partnerSeats === 1 ? '' : 's'} ({preview.partnerOrders} order
              {preview.partnerOrders === 1 ? '' : 's'}), so they leave the monthly statement
            </li>
            <li>
              Void {preview.compSeats} comp seat{preview.compSeats === 1 ? '' : 's'} ({preview.compOrders} order
              {preview.compOrders === 1 ? '' : 's'})
            </li>
            <li>
              Email <strong>{preview.toNotify}</strong> buyer{preview.toNotify === 1 ? '' : 's'}
              {preview.noEmail > 0 ? `; ${preview.noEmail} order(s) have no address on file` : ''}
            </li>
          </ul>
          {preview.sampleEmails.length > 0 && (
            <p style={{ margin: '0 0 8px', wordBreak: 'break-all', ...muted }}>
              e.g. {preview.sampleEmails.join(', ')}
              {preview.toNotify > preview.sampleEmails.length ? ', …' : ''}
            </p>
          )}
          {preview.overDailyMailLimit && (
            <p style={{ margin: '0 0 8px', color: 'var(--theme-warning-500, #d69e2e)' }}>
              That is more than Brevo&apos;s {preview.dailyMailLimit} emails a day, and today&apos;s quota may
              already be partly spent. Sends that hit the limit are counted as failures: run the action
              again tomorrow and it will mail only the buyers it missed.
            </p>
          )}

          {testResult && (
            <p style={{ margin: '0 0 8px', color: 'var(--theme-success-500, #2f855a)' }}>
              Test sent to {testResult.to} (EN + HR). Check your inbox, then confirm.
            </p>
          )}

          {!mayRefund && (
            <p style={{ margin: '0 0 8px', color: 'var(--theme-error-500, #e53e3e)' }}>
              Cancelling moves money, so it needs the <code>refunds</code> permission. Ask someone who
              holds it (Tatjana, Josip) to press the button.
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => post(true)} disabled={loading || !mayRefund} style={secondaryBtn}>
              Send test to me
            </button>
            <button onClick={() => post(false)} disabled={loading || !mayRefund} style={dangerBtn}>
              Cancel show, refund &amp; notify
            </button>
            <button onClick={close} disabled={loading} style={secondaryBtn}>
              Keep show
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
