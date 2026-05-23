'use client'

import React, { useState } from 'react'
import { useDocumentInfo, useTranslation } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

export function CancelShowMenuItem() {
  const { id, collectionSlug } = useDocumentInfo()
  const router = useRouter()
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (collectionSlug !== 'shows') return null

  const handleCancel = async () => {
    if (!id) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/shows/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.errors?.[0]?.message || 'Failed to cancel show.')
        setConfirming(false)
        setLoading(false)
        return
      }

      router.push('/admin/collections/shows')
    } catch {
      setError('Network error. Please try again.')
      setConfirming(false)
      setLoading(false)
    }
  }

  if (confirming) {
    return (
      <div style={{ padding: '8px 16px', minWidth: 240 }}>
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>
          Cancel this show?
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--theme-elevation-500)' }}>
          It will no longer appear on the public performances page. This cannot be undone from here.
        </p>
        {error && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-error-500, #e53e3e)' }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleCancel}
            disabled={loading}
            style={{
              padding: '6px 14px',
              background: 'var(--theme-error-500, #e53e3e)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {loading ? 'Cancelling…' : 'Yes, cancel'}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(null) }}
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
            Keep
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      style={{
        display: 'block',
        width: '100%',
        padding: '8px 16px',
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        fontSize: 14,
        color: 'var(--theme-error-500, #e53e3e)',
      }}
    >
      Cancel Show
    </button>
  )
}
