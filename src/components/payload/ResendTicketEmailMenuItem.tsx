'use client'

import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

// Order edit-menu action: re-send the ticket PDF to the address on the order.
// Sibling of RefundOrderMenuItem (same doc-header dropdown). Sends to the
// persisted Order.email only — to correct a wrong/blank address the admin edits
// the email field first, then resends. English-only to match RefundOrderMenuItem.
export function ResendTicketEmailMenuItem() {
  const { id, collectionSlug, savedDocumentData } = useDocumentInfo()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  if (collectionSlug !== 'orders') return null

  const doc = savedDocumentData as { email?: string | null } | undefined
  const email = typeof doc?.email === 'string' ? doc.email.trim() : ''

  if (!email) {
    return (
      <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--theme-elevation-500)' }}>
        No email on file — add one to send
      </div>
    )
  }

  const handleSend = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${id}/resend-ticket-email`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'The email could not be sent.')
        setLoading(false)
        return
      }
      setSentTo(data?.email || email)
      setLoading(false)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  if (open) {
    return (
      <div style={{ padding: '8px 16px', minWidth: 280 }}>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>
          Send tickets to {email}?
        </p>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--theme-elevation-500)' }}>
          The ticket PDF + calendar file will be emailed to this address. To use a
          different address, edit the order&apos;s email first.
        </p>
        {error && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-error-500, #e53e3e)' }}>
            {error}
          </p>
        )}
        {sentTo && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-success-500, #16a34a)' }}>
            Sent to {sentTo}.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSend}
            disabled={loading || Boolean(sentTo)}
            style={{
              padding: '6px 14px',
              background: 'var(--theme-success-500, #1f7a3a)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: loading || sentTo ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {loading ? 'Sending…' : sentTo ? 'Sent' : 'Send tickets'}
          </button>
          <button
            onClick={() => { setOpen(false); setError(null); setSentTo(null) }}
            disabled={loading}
            style={{
              padding: '6px 14px',
              background: 'var(--theme-elevation-100)',
              color: 'inherit',
              border: '1px solid var(--theme-elevation-200)',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setOpen(true)}
      style={{
        display: 'block',
        width: '100%',
        padding: '8px 16px',
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        fontSize: 14,
        color: 'inherit',
      }}
    >
      Resend ticket email
    </button>
  )
}
