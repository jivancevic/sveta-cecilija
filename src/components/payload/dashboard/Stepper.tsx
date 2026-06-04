'use client'

import React from 'react'

// Number stepper for the partner sell form (revamp). Replaces the native
// `type=number` input, which caused three reported bugs on a phone: leading-zero
// entry ("03"), tiny spinner arrows, and a wheel-scroll-while-focused jump (a
// "tap" that bumped the count by however far the page scrolled). This owns big
// minus/plus tap targets AND a directly-typeable field (for a 30-person tour
// group). The field is `type=text inputMode=numeric` — there is no native
// spinner to scroll, and the value is canonicalised on every edit so a leading
// zero can never persist. Empty renders as the "0" placeholder.
export function Stepper({
  value,
  onChange,
  min = 0,
  disabled = false,
  ariaLabel,
  id,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  disabled?: boolean
  ariaLabel: string
  id?: string
}) {
  // Local text mirrors the field so an in-progress empty edit shows the
  // placeholder; it re-syncs whenever the numeric value changes externally
  // (the +/- buttons, or the form resetting to 0 after a sale).
  const [text, setText] = React.useState(value === min ? '' : String(value))
  React.useEffect(() => {
    setText(value === min ? '' : String(value))
  }, [value, min])

  const commit = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '')
    if (digits === '') {
      setText('')
      if (value !== min) onChange(min)
      return
    }
    const n = Math.max(min, Math.floor(Number(digits)))
    setText(String(n))
    if (n !== value) onChange(n)
  }

  const step = (delta: number) => commit(String(Math.max(min, value + delta)))

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
      <button
        type="button"
        aria-label={`${ariaLabel} −1`}
        disabled={disabled || value <= min}
        onClick={() => step(-1)}
        style={value <= min || disabled ? btnDisabled : btn}
      >
        −
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={ariaLabel}
        value={text}
        placeholder={String(min)}
        disabled={disabled}
        onChange={(e) => commit(e.target.value)}
        style={field}
      />
      <button
        type="button"
        aria-label={`${ariaLabel} +1`}
        disabled={disabled}
        onClick={() => step(1)}
        style={disabled ? btnDisabled : btn}
      >
        +
      </button>
    </div>
  )
}

const btn: React.CSSProperties = {
  width: 44,
  minHeight: 44,
  flex: '0 0 auto',
  fontSize: 22,
  lineHeight: 1,
  fontWeight: 700,
  background: 'var(--theme-elevation-100)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 6,
  color: 'var(--theme-text)',
  cursor: 'pointer',
}
const btnDisabled: React.CSSProperties = {
  ...btn,
  color: 'var(--theme-elevation-400)',
  cursor: 'not-allowed',
}
const field: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  width: '100%',
  textAlign: 'center',
  padding: '10px 8px',
  background: 'var(--theme-elevation-0)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 6,
  color: 'var(--theme-text)',
  fontSize: 16,
  fontWeight: 600,
}
