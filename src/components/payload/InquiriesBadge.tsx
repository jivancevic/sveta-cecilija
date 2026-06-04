import React from 'react'
import Link from 'next/link'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import { formatInquiriesBadge } from '@/lib/dashboard/inquiries'

// Dashboard inquiries badge (#239, ADR-0015). A live count of `new` enquiries
// with the booking sub-count highlighted, linking into the filtered list.
// Self-contained and prop-driven so it can be dropped into the admin branch
// with a minimal insertion (the real counting/copy logic lives in
// src/lib/dashboard/inquiries.ts). Both link targets are the contact-submissions
// list pre-filtered to status=new; the booking link adds the booking types.
const NEW_LIST = '/admin/collections/contact-submissions?where[status][equals]=new'
const BOOKING_LIST =
  '/admin/collections/contact-submissions?where[status][equals]=new' +
  '&where[enquiryType][in]=private-moreska,moreska-experience'

export function InquiriesBadge({
  lang,
  count,
  bookingCount,
}: {
  lang: AdminLang
  count: number
  bookingCount: number
}) {
  const hasNew = count > 0
  const href = bookingCount > 0 ? BOOKING_LIST : NEW_LIST

  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: '14px 16px',
        background: hasNew ? 'var(--theme-elevation-50)' : 'var(--theme-elevation-0)',
        border: '1px solid var(--theme-elevation-150)',
        borderLeft: hasNew ? '3px solid var(--theme-warning-500, #b7791f)' : '1px solid var(--theme-elevation-150)',
        borderRadius: 6,
        textDecoration: 'none',
        color: 'var(--theme-text)',
      }}
    >
      <span
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: 'var(--theme-elevation-500)',
        }}
      >
        {adminT(lang, 'inquiries')}
      </span>
      <span style={{ fontWeight: 600 }}>
        {hasNew ? formatInquiriesBadge(lang, { count, bookingCount }) : adminT(lang, 'inquiriesNone')}
      </span>
    </Link>
  )
}
