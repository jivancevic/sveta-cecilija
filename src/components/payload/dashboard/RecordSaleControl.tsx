'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import { GOLD } from './format'

// Inline per-show "record a sale at the door" control on each show card (#243,
// ADR-0015), rewritten for the offline sales ledger (ADR-0025).
//
// What changed and why: the old control posted ONE positive integer, so a night
// of 68 adults, 6 children and 32 pensioners at €15 collapsed into "106" and the
// money was guessed at a flat €20 a head. It also had no way back — a typo could
// only be undone by hand-editing the field in the collection. This one posts
// LINES (type, quantity, price, reason), accepts negatives as corrections, and
// keeps a discounted seat an adult seat carrying a label rather than inventing a
// third price category.
//
// Posts to /api/shows/[id]/offline-sales (admin-tier guarded, one transaction)
// and refreshes so the card's fill bar and remaining seats re-render from the
// new server total. A cancelled show has no seats to sell, so the control owns
// that precondition and renders nothing.

const CENTS_PER_EUR = 100

interface LineDraft {
  ticketType: 'adult' | 'child'
  quantity: number
  unitPriceCents?: number
  discountLabel?: string
}

function parseCount(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n !== 0 ? n : NaN
}

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
  const [adults, setAdults] = useState('')
  const [children, setChildren] = useState('')
  const [showDiscount, setShowDiscount] = useState(false)
  const [discountCount, setDiscountCount] = useState('')
  const [discountPrice, setDiscountPrice] = useState('')
  const [discountLabel, setDiscountLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setOpen(false)
    setAdults('')
    setChildren('')
    setShowDiscount(false)
    setDiscountCount('')
    setDiscountPrice('')
    setDiscountLabel('')
    setError(null)
  }

  const buildLines = (): LineDraft[] | string => {
    const lines: LineDraft[] = []

    for (const [raw, ticketType] of [
      [adults, 'adult'],
      [children, 'child'],
    ] as const) {
      const n = parseCount(raw)
      if (n === null) continue
      if (Number.isNaN(n)) return adminT(lang, 'saleErrorPositive')
      lines.push({ ticketType, quantity: n })
    }

    if (showDiscount) {
      const n = parseCount(discountCount)
      if (n !== null) {
        if (Number.isNaN(n)) return adminT(lang, 'saleErrorPositive')
        const eur = Number(discountPrice)
        if (discountPrice.trim() === '' || !Number.isFinite(eur) || eur < 0) {
          return adminT(lang, 'saleErrorDiscountReason')
        }
        if (discountLabel.trim() === '') return adminT(lang, 'saleErrorDiscountReason')
        lines.push({
          ticketType: 'adult',
          quantity: n,
          unitPriceCents: Math.round(eur * CENTS_PER_EUR),
          discountLabel: discountLabel.trim(),
        })
      }
    }

    if (lines.length === 0) return adminT(lang, 'saleErrorEmpty')
    return lines
  }

  const handleSubmit = async () => {
    const built = buildLines()
    if (typeof built === 'string') {
      setError(built)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/shows/${showId}/offline-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'door', lines: built }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || adminT(lang, 'saleErrorGeneric'))
        return
      }
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

  const numberInputStyle: React.CSSProperties = {
    width: 80,
    padding: '6px 8px',
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 4,
    fontSize: 13,
    background: 'var(--theme-input-bg, transparent)',
    color: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: 'var(--theme-text)',
  }

  return (
    <div style={{ marginTop: 14, maxWidth: 320 }}>
      <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--theme-text)' }}>
        {adminT(lang, 'addSaleHeading')}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--theme-elevation-500)' }}>
        {adminT(lang, 'addSaleHint')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={labelStyle}>
          <span style={{ width: 96 }}>{adminT(lang, 'addSaleAdults')}</span>
          <input
            type="number"
            inputMode="numeric"
            step={1}
            value={adults}
            onChange={(e) => setAdults(e.target.value)}
            disabled={loading}
            placeholder="0"
            style={numberInputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={{ width: 96 }}>{adminT(lang, 'addSaleChildren')}</span>
          <input
            type="number"
            inputMode="numeric"
            step={1}
            value={children}
            onChange={(e) => setChildren(e.target.value)}
            disabled={loading}
            placeholder="0"
            style={numberInputStyle}
          />
        </label>
      </div>

      {!showDiscount ? (
        <button
          type="button"
          onClick={() => setShowDiscount(true)}
          disabled={loading}
          style={{
            marginTop: 8,
            padding: 0,
            background: 'none',
            border: 'none',
            color: GOLD,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {adminT(lang, 'addSaleDiscountToggle')}
        </button>
      ) : (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--theme-elevation-150)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <label style={labelStyle}>
            <span style={{ width: 96 }}>{adminT(lang, 'addSaleDiscountCount')}</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              value={discountCount}
              onChange={(e) => setDiscountCount(e.target.value)}
              disabled={loading}
              placeholder="0"
              style={numberInputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={{ width: 96 }}>{adminT(lang, 'addSaleDiscountPrice')}</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={discountPrice}
              onChange={(e) => setDiscountPrice(e.target.value)}
              disabled={loading}
              placeholder="15"
              style={numberInputStyle}
            />
          </label>
          <label style={{ ...labelStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
            <span>{adminT(lang, 'addSaleDiscountLabel')}</span>
            <input
              type="text"
              maxLength={120}
              value={discountLabel}
              onChange={(e) => setDiscountLabel(e.target.value)}
              disabled={loading}
              placeholder={adminT(lang, 'addSaleDiscountLabelHint')}
              style={{ ...numberInputStyle, width: '100%' }}
            />
          </label>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: '6px 14px',
            background: GOLD,
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'not-allowed' : 'pointer',
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
