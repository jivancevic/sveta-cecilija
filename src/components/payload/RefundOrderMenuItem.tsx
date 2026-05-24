'use client'

import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

export function RefundOrderMenuItem() {
  const { id, collectionSlug, savedDocumentData } = useDocumentInfo()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (collectionSlug !== 'orders') return null

  const doc = savedDocumentData as
    | { refundStatus?: string; total?: number; stripePaymentIntentId?: string | null }
    | undefined
  const alreadyRefunded = doc?.refundStatus === 'refunded'
  const hasPaymentIntent = Boolean(doc?.stripePaymentIntentId)

  if (alreadyRefunded) {
    return (
      <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--theme-elevation-500)' }}>
        Refunded
      </div>
    )
  }

  if (!hasPaymentIntent) {
    return (
      <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--theme-elevation-500)' }}>
        No Stripe payment — refund N/A
      </div>
    )
  }

  const amountStr = typeof doc?.total === 'number' ? `€${(doc.total / 100).toFixed(2)}` : ''

  const handleRefund = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${id}/refund`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Refund failed.')
        setLoading(false)
        return
      }
      setSuccess(true)
      setLoading(false)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  if (open) {
    return (
      <div style={{ padding: '8px 16px', minWidth: 280 }}>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>
          Refund {amountStr} to buyer?
        </p>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--theme-elevation-500)' }}>
          Full amount will be refunded via Stripe and a confirmation email sent.
        </p>
        {error && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-error-500, #e53e3e)' }}>
            {error}
          </p>
        )}
        {success && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-success-500, #16a34a)' }}>
            Refunded.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleRefund}
            disabled={loading || success}
            style={{
              padding: '6px 14px',
              background: 'var(--theme-error-500, #e53e3e)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: loading || success ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {loading ? 'Refunding…' : success ? 'Done' : `Confirm refund ${amountStr}`}
          </button>
          <button
            onClick={() => { setOpen(false); setError(null); setSuccess(false) }}
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
      Refund order
    </button>
  )
}
