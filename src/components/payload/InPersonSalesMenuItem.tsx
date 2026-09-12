'use client'

import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useSalesActionsVisible } from './useSalesActionsVisible'

// The Shows edit-menu entry for the offline sales ledger (ADR-0025).
//
// The FILE and the export keep their old `InPersonSales` name deliberately: both
// are wired through `payload.config.ts` and the generated importMap, and neither
// is user-facing, so renaming them buys nothing and risks the importMap dance
// (docs/agents/payload-admin.md). Everything a human reads says "at the door".
//
// This is the entry point that reaches a PAST performance — the dashboard's
// inline control only renders on upcoming cards — so it is the one used to
// backfill a season, and the only place that can record a `legacy` line.
//
// It posts LINES rather than one integer: a night is 68 adults, 6 children and
// 32 pensioners at €15, not "106". A negative quantity corrects an earlier
// entry, which the previous version had no way to express at all.

const CENTS_PER_EUR = 100

type Source = 'door' | 'legacy'

interface LineDraft {
  ticketType: 'adult' | 'child'
  quantity: number
  unitPriceCents?: number
  discountLabel?: string
}

interface StoredLine {
  id: number
  source: Source
  ticketType: 'adult' | 'child'
  quantity: number
  unitPriceCents: number
  discountLabel: string | null
}

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`

function parseCount(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n !== 0 ? n : NaN
}

export function InPersonSalesMenuItem() {
  const { id } = useDocumentInfo()
  const visible = useSalesActionsVisible()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<Source>('door')
  const [adults, setAdults] = useState('')
  const [children, setChildren] = useState('')
  const [discountCount, setDiscountCount] = useState('')
  const [discountPrice, setDiscountPrice] = useState('')
  const [discountLabel, setDiscountLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<number | null>(null)
  const [existing, setExisting] = useState<StoredLine[] | null>(null)

  // What is already recorded, so a correction is made against something visible
  // rather than from memory. Without this the seat count can come out right
  // while the money does not: undoing a €15 pensioner line through the €20
  // adult box leaves the same number of seats and €160 less revenue.
  const loadExisting = React.useCallback(async () => {
    if (!id) return
    try {
      const res = await fetch(`/api/shows/${id}/offline-sales`)
      if (!res.ok) return
      const data = await res.json()
      setExisting(Array.isArray(data?.lines) ? data.lines : [])
    } catch {
      // A failed read must not block entry; the form still works blind.
    }
  }, [id])

  // Saved, public Shows document only (#409).
  if (!visible) return null

  const clear = () => {
    setAdults('')
    setChildren('')
    setDiscountCount('')
    setDiscountPrice('')
    setDiscountLabel('')
  }

  const buildLines = (): LineDraft[] | string => {
    const lines: LineDraft[] = []
    for (const [raw, ticketType] of [
      [adults, 'adult'],
      [children, 'child'],
    ] as const) {
      const n = parseCount(raw)
      if (n === null) continue
      if (Number.isNaN(n)) return 'Enter whole numbers only (a negative corrects an earlier entry).'
      lines.push({ ticketType, quantity: n })
    }

    const d = parseCount(discountCount)
    if (d !== null) {
      if (Number.isNaN(d)) return 'Enter whole numbers only (a negative corrects an earlier entry).'
      // Not named `eur`: that is the money FORMATTER at module scope, and
      // shadowing it here would read as a formatting call two lines down.
      const priceEur = Number(discountPrice)
      if (discountPrice.trim() === '' || !Number.isFinite(priceEur) || priceEur < 0) {
        return 'A discounted line needs a price.'
      }
      if (discountLabel.trim() === '') return 'A discounted line needs a reason.'
      lines.push({
        ticketType: 'adult',
        quantity: d,
        unitPriceCents: Math.round(priceEur * CENTS_PER_EUR),
        discountLabel: discountLabel.trim(),
      })
    }

    if (lines.length === 0) return 'Enter at least one ticket count.'
    return lines
  }

  const openPanel = () => {
    setOpen(true)
    void loadExisting()
  }

  const handleSubmit = async () => {
    if (!id) return
    const built = buildLines()
    if (typeof built === 'string') {
      setError(built)
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/shows/${id}/offline-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, lines: built }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Failed to record the sale.')
        setLoading(false)
        return
      }

      setSuccess(data.counter)
      clear()
      setLoading(false)
      void loadExisting()
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 4,
    fontSize: 13,
    background: 'var(--theme-input-bg, transparent)',
    color: 'inherit',
  }

  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 90px',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    fontSize: 13,
  }

  if (open) {
    return (
      <div style={{ padding: '8px 16px', minWidth: 300 }}>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>Add tickets sold at the door</p>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--theme-elevation-500)' }}>
          Adds to the current total. A negative number corrects an earlier entry.
        </p>

        {existing !== null && existing.length > 0 && (
          <div
            style={{
              marginBottom: 12,
              padding: '8px 10px',
              background: 'var(--theme-elevation-50)',
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Already recorded</p>
            {existing.map((l) => (
              <div key={l.id} style={{ color: 'var(--theme-elevation-600)' }}>
                {l.quantity > 0 ? '+' : ''}
                {l.quantity} × {l.ticketType} @ {eur(l.unitPriceCents)}
                {l.discountLabel ? ` (${l.discountLabel})` : ''}
                {l.source === 'legacy' ? ' — previous site' : ''}
              </div>
            ))}
            <p style={{ margin: '6px 0 0', color: 'var(--theme-elevation-500)' }}>
              To undo a line, enter the same ticket type and the same price with a negative count.
            </p>
          </div>
        )}

        <label style={{ ...rowStyle, gridTemplateColumns: '1fr' }}>
          <span style={{ marginBottom: 4 }}>Sold where</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
            disabled={loading}
            style={inputStyle}
          >
            <option value="door">At the door</option>
            <option value="legacy">Previous site (before the cutover)</option>
          </select>
        </label>

        <div style={{ marginTop: 10 }}>
          <label style={rowStyle}>
            <span>Adults (€20)</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              value={adults}
              onChange={(e) => setAdults(e.target.value)}
              disabled={loading}
              placeholder="0"
              style={inputStyle}
            />
          </label>
          <label style={rowStyle}>
            <span>Children (€10)</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              value={children}
              onChange={(e) => setChildren(e.target.value)}
              disabled={loading}
              placeholder="0"
              style={inputStyle}
            />
          </label>
        </div>

        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--theme-elevation-150)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--theme-elevation-500)' }}>
            Discounted adults — still adult tickets, priced lower for a reason.
          </p>
          <label style={rowStyle}>
            <span>How many</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              value={discountCount}
              onChange={(e) => setDiscountCount(e.target.value)}
              disabled={loading}
              placeholder="0"
              style={inputStyle}
            />
          </label>
          <label style={rowStyle}>
            <span>Price each (€)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={discountPrice}
              onChange={(e) => setDiscountPrice(e.target.value)}
              disabled={loading}
              placeholder="15"
              style={inputStyle}
            />
          </label>
          <input
            type="text"
            maxLength={120}
            value={discountLabel}
            onChange={(e) => setDiscountLabel(e.target.value)}
            disabled={loading}
            placeholder="Reason, e.g. pensioners (group discount)"
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </div>

        {error && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--theme-error-500, #e53e3e)' }}>
            {error}
          </p>
        )}
        {success !== null && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--theme-success-500, #16a34a)' }}>
            Added. New {source === 'door' ? 'door' : 'previous-site'} total: {success}.
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '6px 14px',
              background: 'var(--theme-success-500, #16a34a)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {loading ? 'Adding…' : 'Add'}
          </button>
          <button
            onClick={() => {
              setOpen(false)
              setError(null)
              setSuccess(null)
              clear()
            }}
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
      onClick={openPanel}
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
      Add sales at the door
    </button>
  )
}
