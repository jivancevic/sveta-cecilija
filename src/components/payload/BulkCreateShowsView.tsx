'use client'

import React, { useState } from 'react'

const DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
]

type Result = { created: string[]; skipped: string[]; message?: string }

export function BulkCreateShowsView() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [time, setTime] = useState('21:00')
  const [capacity, setCapacity] = useState(250)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDays.length) {
      setError('Select at least one day of the week.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/shows/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, daysOfWeek: selectedDays, time, capacity }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create shows.')
      } else {
        setResult(data)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    background: 'var(--theme-elevation-50)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 4,
    color: 'inherit',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontWeight: 600,
    fontSize: 13,
  }

  const fieldStyle: React.CSSProperties = { marginBottom: 24 }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 560 }}>
      <h1 style={{ marginBottom: 8, fontSize: 24 }}>Bulk Create Shows</h1>
      <p style={{ color: 'var(--theme-elevation-500)', marginBottom: 32, fontSize: 14 }}>
        Create multiple shows at once. Dates where a show already exists are automatically skipped.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Days of the Week</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DAYS.map((day) => {
              const active = selectedDays.includes(day.value)
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 4,
                    border: '1px solid',
                    borderColor: active ? 'var(--theme-success-500)' : 'var(--theme-elevation-150)',
                    background: active ? 'var(--theme-success-500)' : 'var(--theme-elevation-50)',
                    color: active ? '#fff' : 'inherit',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {day.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div>
            <label style={labelStyle}>Show Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Capacity</label>
            <input
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              min={1}
              required
              style={inputStyle}
            />
          </div>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'var(--theme-error-50, #fff0f0)',
              border: '1px solid var(--theme-error-500, #e53e3e)',
              borderRadius: 4,
              color: 'var(--theme-error-500, #e53e3e)',
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <div
            style={{
              marginBottom: 20,
              padding: '14px 16px',
              background: 'var(--theme-success-50, #f0fff4)',
              border: '1px solid var(--theme-success-500, #38a169)',
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
              {result.created.length} show{result.created.length !== 1 ? 's' : ''} created
              {result.skipped.length > 0 && (
                <>
                  {' '}· {result.skipped.length} skipped (already exist)
                </>
              )}
            </p>
            {result.message && (
              <p style={{ margin: '4px 0 0', color: 'var(--theme-elevation-600)' }}>{result.message}</p>
            )}
            {result.skipped.length > 0 && (
              <p style={{ margin: '4px 0 0', color: 'var(--theme-elevation-600)' }}>
                Skipped: {result.skipped.join(', ')}
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 24px',
            background: loading ? 'var(--theme-elevation-200)' : 'var(--theme-success-500, #38a169)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {loading ? 'Creating…' : 'Create Shows'}
        </button>
      </form>
    </div>
  )
}
