'use client'

import { useState, useTransition } from 'react'

interface LookupResult {
  id: string
  buyerName: string
  email: string
  adultCount: number
  childCount: number
  refundStatus: 'none' | 'refunded'
  tokens: Array<{ token: string; scanned: boolean }>
}

interface Props {
  showId: string
}

export function TicketLookupPanel({ showId }: Props) {
  const [mode, setMode] = useState<'email' | 'name'>('email')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LookupResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const q = query.trim()
    if (!q) return
    startTransition(async () => {
      try {
        const res = await fetch('/api/orders/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ showId, query: q, mode }),
        })
        const data = (await res.json()) as { results?: LookupResult[]; error?: string }
        if (!res.ok) {
          setError(data.error ?? 'Lookup failed')
          setResults(null)
          return
        }
        setResults(data.results ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lookup failed')
        setResults(null)
      }
    })
  }

  const placeholder =
    mode === 'email' ? 'buyer@example.com' : 'First Last'

  return (
    <div style={panelStyle}>
      <h3 style={{ fontSize: 14, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        Find ticket
      </h3>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="radio"
              name="mode"
              value="email"
              checked={mode === 'email'}
              onChange={() => setMode('email')}
            />
            Email
          </label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="radio"
              name="mode"
              value="name"
              checked={mode === 'name'}
              onChange={() => setMode('name')}
            />
            Name
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type={mode === 'email' ? 'email' : 'text'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            style={inputStyle}
            disabled={pending}
            autoComplete="off"
          />
          <button type="submit" disabled={pending || !query.trim()} style={buttonStyle}>
            {pending ? '…' : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <p style={{ color: 'var(--theme-error-500, #c33)', fontSize: 13, margin: '8px 0 0' }}>
          {error}
        </p>
      )}

      {results !== null && (
        <div style={{ marginTop: 12 }}>
          {results.length === 0 ? (
            <p style={{ fontSize: 13, opacity: 0.8, margin: 0 }}>
              No matching order on this show.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {results.map((o) => (
                <li key={o.id} style={resultStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{o.buyerName}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{o.email}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {o.adultCount} adult{o.adultCount === 1 ? '' : 's'}, {o.childCount} child
                        {o.childCount === 1 ? '' : 'ren'}
                        {o.refundStatus === 'refunded' && ' · REFUNDED'}
                      </div>
                    </div>
                  </div>
                  {o.tokens.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13 }}>
                        <span
                          style={{
                            color: o.tokens[0].scanned
                              ? 'var(--theme-success-500, #2a7)'
                              : 'var(--theme-elevation-600)',
                          }}
                        >
                          {o.tokens[0].scanned ? '✓ scanned' : 'not scanned'}
                        </span>
                      </span>
                      {!o.tokens[0].scanned && (
                        <a href={`/scan/${o.tokens[0].token}`} target="_blank" rel="noopener" style={scanLinkStyle}>
                          Scan
                        </a>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
  padding: 16,
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  background: 'var(--theme-input-bg, var(--theme-bg))',
  color: 'var(--theme-text)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 4,
  fontSize: 14,
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--theme-elevation-100)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 4,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  color: 'var(--theme-text)',
}

const resultStyle: React.CSSProperties = {
  padding: 10,
  background: 'var(--theme-bg)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 4,
}

const scanLinkStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: 'var(--theme-success-500, #2a7)',
  color: '#fff',
  textDecoration: 'none',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
}
