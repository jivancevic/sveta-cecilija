'use client'

import { useState } from 'react'

// Client half of the self-serve refund page (ADR-0021). The server renders the
// order summary + eligibility; this owns only the irreversible action: a
// deliberately SECONDARY (outlined) CTA that reveals an explicit confirm step,
// then POSTs to the token-authed refund route. Reassurance stays visually
// primary on the server-rendered page — this button reads as "only if you need it".
export interface RefundConfirmCopy {
  cta: string // secondary button: "Cancel & refund my tickets"
  confirmQuestion: string // "This voids all N tickets and cannot be undone. Continue?"
  confirmYes: string // "Yes, cancel and refund"
  cancel: string // "Keep my tickets"
  working: string // "Processing your refund…"
  successTitle: string
  successBody: string // "€X has been returned to your card. It may take 5-10 days to appear."
  errorBody: string // generic retry
}

type Phase = 'idle' | 'confirming' | 'working' | 'done' | 'error'

const gold = '#b48a3c'
const ink = '#1a1a1a'

export default function RefundConfirm({
  token,
  copy,
}: {
  token: string
  copy: RefundConfirmCopy
}) {
  const [phase, setPhase] = useState<Phase>('idle')

  async function submit() {
    setPhase('working')
    try {
      const res = await fetch(`/api/order/${encodeURIComponent(token)}/refund`, { method: 'POST' })
      if (!res.ok) {
        setPhase('error')
        return
      }
      setPhase('done')
    } catch {
      setPhase('error')
    }
  }

  if (phase === 'done') {
    return (
      <div style={{ marginTop: '1.75rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', lineHeight: 1 }}>✓</div>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', margin: '0.75rem 0 0.5rem' }}>
          {copy.successTitle}
        </h2>
        <p style={{ fontSize: '1rem', lineHeight: 1.6, color: '#3d372f', margin: 0 }}>{copy.successBody}</p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div style={{ marginTop: '1.75rem', textAlign: 'center' }}>
        <p style={{ fontSize: '1rem', lineHeight: 1.6, color: '#8a3b2f', margin: '0 0 1rem' }}>{copy.errorBody}</p>
        <button type="button" onClick={submit} style={secondaryBtn}>
          {copy.cta}
        </button>
      </div>
    )
  }

  if (phase === 'working') {
    return (
      <p style={{ marginTop: '1.75rem', textAlign: 'center', fontSize: '1rem', color: '#6b6257' }}>{copy.working}</p>
    )
  }

  if (phase === 'confirming') {
    return (
      <div style={{ marginTop: '1.75rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#3d372f', margin: '0 0 1rem' }}>
          {copy.confirmQuestion}
        </p>
        <button type="button" onClick={submit} style={{ ...secondaryBtn, marginBottom: '0.6rem', width: '100%' }}>
          {copy.confirmYes}
        </button>
        <button
          type="button"
          onClick={() => setPhase('idle')}
          style={{ ...linkBtn, width: '100%' }}
        >
          {copy.cancel}
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '1.75rem', textAlign: 'center' }}>
      <button type="button" onClick={() => setPhase('confirming')} style={secondaryBtn}>
        {copy.cta}
      </button>
    </div>
  )
}

const secondaryBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '12px 22px',
  fontFamily: 'inherit',
  fontSize: '0.95rem',
  fontWeight: 600,
  letterSpacing: '0.01em',
  color: gold,
  background: 'transparent',
  border: `1.5px solid ${gold}`,
  borderRadius: '3px',
  cursor: 'pointer',
}

const linkBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 18px',
  fontFamily: 'inherit',
  fontSize: '0.9rem',
  fontWeight: 500,
  color: ink,
  background: 'transparent',
  border: 'none',
  textDecoration: 'underline',
  cursor: 'pointer',
}
