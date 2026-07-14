'use client'

import React from 'react'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import { CompIssueForm, type CompMember } from './CompIssueForm'
import type { SellShow } from './PartnerSellForm'

// Admin-dashboard disclosure for the comp-issue flow (#318, ADR-0019). The
// secretary dashboard is busy, so the goodwill-ticket form lives behind an
// action button ("Issue comp tickets") rather than always-on like the partner
// sell form. Tapping the button reveals the partner-style CompIssueForm.
export function CompIssuePanel({
  shows,
  members,
  lang,
}: {
  shows: SellShow[]
  members: CompMember[]
  lang: AdminLang
}) {
  const [open, setOpen] = React.useState(false)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={actionBtn}>
        {adminT(lang, 'compAction')}
      </button>
    )
  }

  return <CompIssueForm shows={shows} members={members} lang={lang} />
}

const actionBtn: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '14px 16px',
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
  color: 'var(--theme-text)',
  fontWeight: 600,
  textAlign: 'center',
  cursor: 'pointer',
}
