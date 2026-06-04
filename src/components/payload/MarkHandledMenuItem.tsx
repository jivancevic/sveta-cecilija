'use client'

import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

// "Mark handled" edit-menu action for a contact submission (#239, ADR-0015).
// Drives the new → handled transition so the dashboard inquiries badge drops it.
// Uses Payload's built-in REST PATCH on the collection, which (unlike the local
// API) enforces the collection's admin-tier `update` access — so no extra route
// guard is needed. Idempotent: re-running on a handled row is a harmless no-op.
export function MarkHandledMenuItem() {
  const { id, collectionSlug, savedDocumentData } = useDocumentInfo()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (collectionSlug !== 'contact-submissions') return null

  // Already handled → nothing to do; hide the action to keep the menu honest.
  const status = (savedDocumentData as { status?: string } | undefined)?.status
  if (status === 'handled') return null

  const handle = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/contact-submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'handled' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.errors?.[0]?.message || 'Failed to mark handled.')
        setLoading(false)
        return
      }
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handle}
        disabled={loading}
        style={{
          display: 'block',
          width: '100%',
          padding: '8px 16px',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 14,
          color: 'var(--theme-text)',
        }}
      >
        {loading ? 'Marking…' : 'Mark handled'}
      </button>
      {error && (
        <p style={{ margin: '0 16px 8px', fontSize: 12, color: 'var(--theme-error-500, #e53e3e)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
