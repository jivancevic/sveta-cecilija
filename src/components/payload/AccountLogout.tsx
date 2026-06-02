'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useAuth, useDocumentInfo } from '@payloadcms/ui'

// Adds account-view chrome (#167) via a `ui` field on Users, scoped to the
// viewer's OWN record (the Users edit form is reused for the account page and,
// for superadmin, for editing other users — without this guard these controls
// would appear on someone else's page and act on the viewer).
//
// Placement: the account view renders the document fields and a built-in
// `.payload-settings` block as siblings under a `.gutter`. A normal field can
// only land inside the form (above settings), so we portal into hosts inserted
// at the very top and very bottom of that gutter:
//   - top:    "Back to dashboard" — there was previously no obvious way back
//             from the account page (only the unlabeled brand logo).
//   - bottom: red "Log out" — below everything, including Payload Settings.
export function AccountLogout() {
  const { user, logOut } = useAuth()
  const { id } = useDocumentInfo()
  const router = useRouter()

  const ownAccount = !!user && id != null && String(user.id) === String(id)

  // Portal hosts for the account view. The view renders the document fields and
  // a built-in `.payload-settings` block as siblings under a `.gutter`; a normal
  // field can only land inside the form (above settings), so we create host nodes
  // at the top and very bottom of the gutter and portal into them. Standard
  // "portal into a dynamically created node" pattern: create in an effect, hold
  // in state. The React-Compiler set-state-in-effect rule doesn't model this DOM
  // interop, so it's disabled for the one synchronizing setState below.
  const [hosts, setHosts] = React.useState<{ top: HTMLElement; bottom: HTMLElement } | null>(null)

  React.useEffect(() => {
    if (!ownAccount) return
    const gutter =
      document.querySelector('.payload-settings')?.parentElement ||
      document.querySelector('.document-fields__fields')?.parentElement
    if (!gutter) return

    const top = document.createElement('div')
    top.className = 'account-back-host'
    gutter.insertBefore(top, gutter.firstChild)
    const bottom = document.createElement('div')
    bottom.className = 'account-logout-host'
    gutter.appendChild(bottom)

    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing the just-created portal hosts into state
    setHosts({ top, bottom })
    return () => {
      top.remove()
      bottom.remove()
      setHosts(null)
    }
  }, [ownAccount])

  if (!ownAccount || !hosts) return null

  const handleLogout = () => {
    void (async () => {
      try {
        await logOut()
      } finally {
        window.location.href = '/admin/login'
      }
    })()
  }

  const linkButton: React.CSSProperties = {
    display: 'inline-block',
    padding: '8px 14px',
    background: 'transparent',
    border: 'none',
    color: 'var(--theme-elevation-600)',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'underline',
  }

  const logoutButton: React.CSSProperties = {
    display: 'inline-block',
    padding: '8px 14px',
    background: 'var(--theme-error-500, #c0392b)',
    border: '1px solid var(--theme-error-600, #a93226)',
    borderRadius: 6,
    color: '#fff',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  }

  return (
    <>
      {createPortal(
        <div style={{ marginBottom: 16 }}>
          <button type="button" onClick={() => router.push('/admin')} style={linkButton}>
            ← Back to dashboard
          </button>
        </div>,
        hosts.top,
      )}
      {createPortal(
        <div
          style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid var(--theme-elevation-150)',
          }}
        >
          <button type="button" onClick={handleLogout} style={logoutButton}>
            Log out
          </button>
        </div>,
        hosts.bottom,
      )}
    </>
  )
}
