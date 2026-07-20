'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import { Stepper } from './dashboard/Stepper'
import type { SellShow } from './PartnerSellForm'

export interface CompMember {
  id: string
  name: string
}

// Success-banner lifetime; the countdown bar drains over exactly this.
const BANNER_MS = 10000

// Comp (goodwill) ticket issue form (#318, ADR-0019). The free, admin-only
// sibling of PartnerSellForm: pick a show, pick a REQUIRED member (with inline
// "+ Add member"), set adult/child counts via the Stepper, optionally override
// the printed holder name and add an email, submit to /api/comp/issue, open the
// combined ticket PDF, then show a self-dismissing success banner and
// router.refresh() so the dashboard's seat figures re-render in place.
export function CompIssueForm({
  shows,
  members: initialMembers,
  lang,
}: {
  shows: SellShow[]
  members: CompMember[]
  lang: AdminLang
}) {
  const router = useRouter()
  const [members, setMembers] = React.useState<CompMember[]>(initialMembers)
  const [showId, setShowId] = React.useState(shows[0]?.id ?? '')
  const [memberId, setMemberId] = React.useState('')
  const [adults, setAdults] = React.useState(0)
  const [children, setChildren] = React.useState(0)
  const [holderName, setHolderName] = React.useState('')
  const [nameEdited, setNameEdited] = React.useState(false)
  const [email, setEmail] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [banner, setBanner] = React.useState<{
    orderId: string
    code: string
    ticketCount: number
    emailStatus: 'sent' | 'skipped' | 'failed'
    emailTo: string | null
  } | null>(null)

  // Member picker state.
  const [memberQuery, setMemberQuery] = React.useState('')
  const [addingOpen, setAddingOpen] = React.useState(false)
  const [newMemberName, setNewMemberName] = React.useState('')
  const [savingMember, setSavingMember] = React.useState(false)
  const [memberError, setMemberError] = React.useState<string | null>(null)

  const selectedMember = members.find((m) => m.id === memberId)

  // Prefill the printed holder name from the selected member, unless the admin
  // has typed their own value (a specific guest). "Adjust state during render"
  // pattern (React docs) rather than an effect, to satisfy the compiler lint.
  const [lastMemberId, setLastMemberId] = React.useState(memberId)
  if (memberId !== lastMemberId) {
    setLastMemberId(memberId)
    if (!nameEdited) setHolderName(selectedMember?.name ?? '')
  }

  const selected = shows.find((s) => s.id === showId)
  const total = adults + children
  const overRemaining = !!selected && total > selected.remaining
  const canSubmit = !!showId && !!memberId && total > 0 && !overRemaining && !submitting

  const filteredMembers = React.useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => m.name.toLowerCase().includes(q))
  }, [members, memberQuery])

  const dismissBanner = React.useCallback(() => setBanner(null), [])

  const openPdf = (orderId: string) =>
    window.open(`/api/orders/${orderId}/tickets.pdf`, '_blank', 'noopener')

  const addMember = async () => {
    const name = newMemberName.trim()
    if (!name) return
    setSavingMember(true)
    setMemberError(null)
    try {
      const res = await fetch('/api/comp/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.member) {
        setMemberError(adminT(lang, 'compAddMemberFailed'))
        return
      }
      const created: CompMember = data.member
      setMembers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setMemberId(created.id)
      setMemberQuery('')
      setNewMemberName('')
      setAddingOpen(false)
    } catch {
      setMemberError(adminT(lang, 'compAddMemberFailed'))
    } finally {
      setSavingMember(false)
    }
  }

  const submit = async () => {
    if (!memberId) {
      setError(adminT(lang, 'compMemberRequired'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/comp/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId,
          memberId,
          adults,
          children,
          buyerName: holderName.trim() || null,
          email: email.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(res.status === 409 ? adminT(lang, 'notEnoughSeats') : adminT(lang, 'compFailed'))
        return
      }
      openPdf(data.orderId)
      setBanner({
        orderId: data.orderId,
        code: data.code,
        ticketCount: data.ticketCount,
        emailStatus: data.emailStatus === 'sent' || data.emailStatus === 'failed' ? data.emailStatus : 'skipped',
        emailTo: typeof data.emailTo === 'string' ? data.emailTo : null,
      })
      setAdults(0)
      setChildren(0)
      setMemberId('')
      setMemberQuery('')
      setHolderName('')
      setNameEdited(false)
      setEmail('')
      router.refresh()
    } catch {
      setError(adminT(lang, 'saleErrorNetwork'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 16, marginBottom: 14 }}>{adminT(lang, 'compTitle')}</h2>

      {banner && (
        <SuccessBanner
          lang={lang}
          code={banner.code}
          ticketCount={banner.ticketCount}
          emailStatus={banner.emailStatus}
          emailTo={banner.emailTo}
          onOpenPdf={() => openPdf(banner.orderId)}
          onClose={dismissBanner}
        />
      )}

      {shows.length === 0 ? (
        <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, margin: 0 }}>
          {adminT(lang, 'noShowsToSell')}
        </p>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="cif-show" style={label}>
              {adminT(lang, 'showWord')}
            </label>
            <select id="cif-show" value={showId} onChange={(e) => setShowId(e.target.value)} style={field}>
              {shows.map((s) => (
                <option key={s.id} value={s.id} disabled={s.remaining <= 0}>
                  {s.label} —{' '}
                  {s.remaining > 0 ? `${s.remaining} ${adminT(lang, 'seatsLeft')}` : adminT(lang, 'soldOut')}
                </option>
              ))}
            </select>
          </div>

          {/* Searchable member picker with inline add. Member is required. */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="cif-member-search" style={label}>
              {adminT(lang, 'compMember')}
            </label>
            <input
              id="cif-member-search"
              type="text"
              value={memberQuery}
              placeholder={adminT(lang, 'compMemberSearch')}
              onChange={(e) => setMemberQuery(e.target.value)}
              disabled={submitting}
              style={field}
            />
            {members.length === 0 && !addingOpen ? (
              <p style={{ color: 'var(--theme-elevation-500)', fontSize: 13, margin: '8px 0 0' }}>
                {adminT(lang, 'compNoMembers')}
              </p>
            ) : (
              <div style={memberList}>
                {filteredMembers.map((m) => {
                  const active = m.id === memberId
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMemberId(m.id)}
                      disabled={submitting}
                      style={active ? memberRowActive : memberRow}
                    >
                      {m.name}
                    </button>
                  )
                })}
              </div>
            )}

            {addingOpen ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={newMemberName}
                  placeholder={adminT(lang, 'compNewMemberName')}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  disabled={savingMember}
                  style={{ ...field, flex: 1, minWidth: 150 }}
                />
                <button
                  type="button"
                  onClick={addMember}
                  disabled={savingMember || !newMemberName.trim()}
                  style={newMemberName.trim() && !savingMember ? primaryBtn : disabledBtn}
                >
                  {savingMember ? adminT(lang, 'issuing') : adminT(lang, 'compSaveMember')}
                </button>
                <button type="button" onClick={() => setAddingOpen(false)} style={ghostBtn}>
                  {adminT(lang, 'cancel')}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setAddingOpen(true)} style={addBtn}>
                {adminT(lang, 'compAddMember')}
              </button>
            )}
            {memberError && (
              <p style={{ color: 'var(--theme-error-500, #c0392b)', fontSize: 13, margin: '8px 0 0' }}>
                {memberError}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="cif-adults" style={label}>
                {adminT(lang, 'adults')}
              </label>
              <Stepper
                id="cif-adults"
                value={adults}
                onChange={setAdults}
                disabled={submitting}
                ariaLabel={adminT(lang, 'adults')}
              />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="cif-children" style={label}>
                {adminT(lang, 'children')}
              </label>
              <Stepper
                id="cif-children"
                value={children}
                onChange={setChildren}
                disabled={submitting}
                ariaLabel={adminT(lang, 'children')}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="cif-holder" style={label}>
              {adminT(lang, 'compHolderName')}
            </label>
            <input
              id="cif-holder"
              type="text"
              value={holderName}
              placeholder={adminT(lang, 'compHolderHint')}
              onChange={(e) => {
                setNameEdited(true)
                setHolderName(e.target.value)
              }}
              disabled={submitting}
              style={field}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="cif-email" style={label}>
              {adminT(lang, 'compEmail')}
            </label>
            <input
              id="cif-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              style={field}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, color: 'var(--theme-elevation-600)' }}>
              {total > 0 ? <strong>{total}</strong> : adminT(lang, 'enterCounts')}
            </div>
            <button type="button" onClick={submit} disabled={!canSubmit} style={canSubmit ? primaryBtn : disabledBtn}>
              {submitting ? adminT(lang, 'issuing') : adminT(lang, 'compIssue')}
            </button>
          </div>

          {overRemaining && (
            <p style={{ color: 'var(--theme-error-500, #c0392b)', fontSize: 13, margin: '10px 0 0' }}>
              {adminT(lang, 'notEnoughSeats')}
            </p>
          )}
          {error && (
            <p style={{ color: 'var(--theme-error-500, #c0392b)', fontSize: 13, margin: '10px 0 0' }}>{error}</p>
          )}
        </>
      )}
    </div>
  )
}

function SuccessBanner({
  lang,
  code,
  ticketCount,
  emailStatus,
  emailTo,
  onOpenPdf,
  onClose,
}: {
  lang: AdminLang
  code: string
  ticketCount: number
  emailStatus: 'sent' | 'skipped' | 'failed'
  emailTo: string | null
  onOpenPdf: () => void
  onClose: () => void
}) {
  // A failed email is a warning the admin must act on (resend), so that banner
  // stays amber and never auto-dismisses. Sent/skipped stay green and drain.
  const failed = emailStatus === 'failed'
  const [width, setWidth] = React.useState(100)
  React.useEffect(() => {
    if (failed) return
    const raf = requestAnimationFrame(() => setWidth(0))
    const fallback = setTimeout(onClose, BANNER_MS + 600)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(fallback)
    }
  }, [onClose, failed])

  const emailLine =
    emailStatus === 'sent'
      ? `${adminT(lang, 'compEmailSent')}${emailTo ? ` ${emailTo}` : ''}`
      : emailStatus === 'failed'
        ? `⚠ ${adminT(lang, 'compEmailFailed')}${emailTo ? ` ${emailTo}` : ''} — ${adminT(lang, 'compEmailFailedHint')}`
        : adminT(lang, 'compEmailSkipped')

  return (
    <div
      role="status"
      style={{
        background: failed ? '#8a5a00' : '#1f7a3a',
        border: `1px solid ${failed ? '#6e4700' : '#19632f'}`,
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 16,
        color: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 14, color: '#fff' }}>
          <strong>{adminT(lang, 'compDoneTitle')}</strong>
          <div style={{ color: 'rgba(255,255,255,0.88)', marginTop: 2 }}>
            {ticketCount} · <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{code}</span> ·{' '}
            {adminT(lang, 'saleDonePdf')}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.95)', marginTop: 4, fontWeight: failed ? 700 : 400 }}>
            {emailLine}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="×" style={closeBtn}>
          ×
        </button>
      </div>
      <button type="button" onClick={onOpenPdf} style={linkBtn}>
        {adminT(lang, 'openPdfAgain')}
      </button>
      {!failed && (
        <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.3)', overflow: 'hidden', marginTop: 8 }}>
          <div
            onTransitionEnd={(e) => {
              if (e.propertyName === 'width') onClose()
            }}
            style={{
              width: `${width}%`,
              height: '100%',
              background: '#fff',
              transition: `width ${BANNER_MS}ms linear`,
            }}
          />
        </div>
      )}
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: 20,
}
const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--theme-elevation-600)',
  marginBottom: 4,
}
const field: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--theme-elevation-0)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 6,
  color: 'var(--theme-text)',
  fontSize: 14,
}
const memberList: React.CSSProperties = {
  marginTop: 8,
  maxHeight: 180,
  overflowY: 'auto',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
  display: 'flex',
  flexDirection: 'column',
}
const memberRow: React.CSSProperties = {
  textAlign: 'left',
  padding: '9px 12px',
  background: 'var(--theme-elevation-0)',
  border: 'none',
  borderBottom: '1px solid var(--theme-elevation-100)',
  color: 'var(--theme-text)',
  fontSize: 14,
  cursor: 'pointer',
}
const memberRowActive: React.CSSProperties = {
  ...memberRow,
  background: 'var(--theme-success-100, #d7ecdd)',
  fontWeight: 700,
}
const primaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  background: 'var(--theme-success-500, #1f7a3a)',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
}
const disabledBtn: React.CSSProperties = {
  ...primaryBtn,
  background: 'var(--theme-elevation-150)',
  color: 'var(--theme-elevation-400)',
  cursor: 'not-allowed',
}
const ghostBtn: React.CSSProperties = {
  padding: '10px 16px',
  background: 'none',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 6,
  color: 'var(--theme-text)',
  fontSize: 14,
  cursor: 'pointer',
}
const addBtn: React.CSSProperties = {
  marginTop: 8,
  padding: '6px 0',
  background: 'none',
  border: 'none',
  color: 'var(--theme-success-600, #1f7a3a)',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
}
const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.85)',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
}
const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#fff',
  fontWeight: 600,
  fontSize: 13,
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: '6px 0 0',
}
