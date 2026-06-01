'use client'

import React from 'react'
import { useAuth, useDocumentInfo } from '@payloadcms/ui'

// Rendered as a `ui` field on the Users collection, so it appears at the bottom
// of the account view (/admin/account). Logout lives here rather than on the
// dashboards (#167). Scoped to the viewer's OWN record: the Users edit form is
// reused for the account view and (for superadmin) for editing other users —
// without this guard a "Log out" on someone else's edit page would confusingly
// log out the viewer, not that user.
//
// Uses Payload's `logOut()` (from useAuth) rather than a link to /admin/logout:
// a Next <Link> rendered inside the admin edit form gets swallowed by the form
// and never navigates. logOut() clears the session and the admin SPA redirects
// to the login screen; the hard redirect is a belt-and-braces fallback.
export function AccountLogout() {
  const { user, logOut } = useAuth()
  const { id } = useDocumentInfo()

  if (!user || id == null || String(user.id) !== String(id)) return null

  const handleClick = () => {
    void (async () => {
      try {
        await logOut()
      } finally {
        window.location.href = '/admin/login'
      }
    })()
  }

  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 16,
        borderTop: '1px solid var(--theme-elevation-150)',
      }}
    >
      <button
        type="button"
        onClick={handleClick}
        style={{
          display: 'inline-block',
          padding: '8px 14px',
          background: 'var(--theme-elevation-50)',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 6,
          color: 'var(--theme-text)',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Log out
      </button>
    </div>
  )
}
