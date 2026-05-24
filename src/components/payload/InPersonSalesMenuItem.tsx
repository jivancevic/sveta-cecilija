'use client'

import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

export function InPersonSalesMenuItem() {
  const { id, collectionSlug } = useDocumentInfo()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<number | null>(null)

  if (collectionSlug !== 'shows') return null

  const handleSubmit = async () => {
    if (!id) return
    const n = Number(count)
    if (!Number.isInteger(n) || n <= 0) {
      setError('Enter a positive whole number.')
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/shows/${id}/in-person-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: n }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Failed to record in-person sales.')
        setLoading(false)
        return
      }

      setSuccess(data.inPersonSold)
      setCount('')
      setLoading(false)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  if (open) {
    return (
      <div style={{ padding: '8px 16px', minWidth: 260 }}>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>
          Add in-person ticket sales
        </p>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--theme-elevation-500)' }}>
          Adds to the current total — does not replace it.
        </p>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          disabled={loading}
          placeholder="e.g. 12"
          style={{
            width: '100%',
            padding: '6px 8px',
            marginBottom: 10,
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: 4,
            fontSize: 13,
            background: 'var(--theme-input-bg, transparent)',
            color: 'inherit',
          }}
        />
        {error && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-error-500, #e53e3e)' }}>
            {error}
          </p>
        )}
        {success !== null && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-success-500, #16a34a)' }}>
            Added. New in-person total: {success}.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSubmit}
            disabled={loading || count === ''}
            style={{
              padding: '6px 14px',
              background: 'var(--theme-success-500, #16a34a)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: loading || count === '' ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {loading ? 'Adding…' : 'Add'}
          </button>
          <button
            onClick={() => { setOpen(false); setError(null); setSuccess(null); setCount('') }}
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
      Add In-Person Sales
    </button>
  )
}
