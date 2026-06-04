'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import { GOLD } from './format'

// Inline per-show "record in-person sale" control on each upcoming-show card
// (#243, ADR-0015). Replaces the old global button that dead-ended on the raw
// Shows list: here the showId is fixed by the card, so a count is recorded
// against THAT show. Posts to the per-show seam (/api/shows/[id]/in-person-sales,
// admin-tier guarded, atomic increment) and refreshes the dashboard so the fill
// bar / remaining seats reflect the new total immediately. A cancelled show has
// no seats to sell, so the control owns that precondition and renders nothing.
export function RecordSaleControl({
  showId,
  lang,
  cancelled = false,
}: {
  showId: string
  lang: AdminLang
  cancelled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setOpen(false)
    setCount('')
    setError(null)
  }

  const handleSubmit = async () => {
    const n = Number(count)
    if (!Number.isInteger(n) || n <= 0) {
      setError(adminT(lang, 'saleErrorPositive'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/shows/${showId}/in-person-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: n }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || adminT(lang, 'saleErrorGeneric'))
        return
      }
      // Recorded — close and refresh so the card's sold / remaining figures
      // re-render from the new server total.
      reset()
      router.refresh()
    } catch {
      setError(adminT(lang, 'saleErrorNetwork'))
    } finally {
      setLoading(false)
    }
  }

  if (cancelled) return null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          marginTop: 14,
          padding: '6px 12px',
          background: 'transparent',
          border: `1px solid ${GOLD}`,
          borderRadius: 6,
          color: GOLD,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {adminT(lang, 'addSale')}
      </button>
    )
  }

  return (
    <div style={{ marginTop: 14, maxWidth: 280 }}>
      <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--theme-text)' }}>
        {adminT(lang, 'addSaleHeading')}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-elevation-500)' }}>
        {adminT(lang, 'addSaleHint')}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          disabled={loading}
          aria-label={adminT(lang, 'addSaleCount')}
          placeholder="0"
          style={{
            width: 80,
            padding: '6px 8px',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: 4,
            fontSize: 13,
            background: 'var(--theme-input-bg, transparent)',
            color: 'inherit',
          }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || count === ''}
          style={{
            padding: '6px 14px',
            background: GOLD,
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: loading || count === '' ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {loading ? adminT(lang, 'adding') : adminT(lang, 'add')}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={loading}
          style={{
            padding: '6px 12px',
            background: 'var(--theme-elevation-100)',
            color: 'inherit',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {adminT(lang, 'cancel')}
        </button>
      </div>
      {error && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--theme-error-500, #e53e3e)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
