'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Permission } from '@/lib/access/permissions'
import { APP_STRINGS } from '@/lib/app/strings'
import type { Handover } from '@/lib/app/users-account'
import { allPermissionChips } from '@/lib/app/users-view'
import { HandoverPanel, Sheet } from './UserSheet'

// "Novi korisnik" (#510): the one thing this screen creates.
//
// The checkbox list is `allPermissionChips()`, which reads the vocabulary
// itself — nothing here re-types a permission word, so a twelfth one appears
// with its Croatian label and its hint the moment it is added.
//
// The form is deliberately small: a username, a name, an address and a set.
// Everything else an account can carry (the partner link, the member link, the
// shared flag) is a named action on the detail, because each of them has its
// own refusals and a create form that could fail six ways is a form nobody
// finishes.
//
// What comes back is a live credential, so the form does not close on success:
// it turns into the handover panel and waits for Gotovo.

const S = APP_STRINGS.users

export function NewUserForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [handover, setHandover] = useState<Handover | null>(null)

  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [shared, setShared] = useState(false)
  const [permissions, setPermissions] = useState<Permission[]>([])

  function toggle(permission: Permission) {
    setPermissions((held) =>
      held.includes(permission) ? held.filter((p) => p !== permission) : [...held, permission],
    )
  }

  function reset() {
    setOpen(false)
    setHandover(null)
    setError(null)
    setUsername('')
    setName('')
    setEmail('')
    setShared(false)
    setPermissions([])
    router.refresh()
  }

  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, email, permissions, shared }),
      })
      const body = (await res.json().catch(() => null)) as
        | { error?: string; handover?: Handover }
        | null
      if (!res.ok) {
        // The route is ours, so its refusals are already the Croatian sentences
        // in `users-account.ts` and each names the field that was wrong.
        setError(body?.error ?? S.create.failed)
        return
      }
      setHandover(body?.handover ?? { kind: 'none' })
      router.refresh()
    } catch {
      setError(S.create.failed)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="app__users-new">
        <button type="button" className="app__button" onClick={() => setOpen(true)}>
          {S.actions.create}
        </button>
      </div>
    )
  }

  if (handover) {
    return (
      <div className="app__users-new">
        <HandoverPanel handover={handover} close={reset} />
      </div>
    )
  }

  return (
    <div className="app__users-new">
      <Sheet
        title={S.create.title}
        body={S.create.body}
        error={error}
        busy={busy}
        confirm={submit}
        confirmLabel={S.create.submit}
        close={reset}
      >
        <label className="app__field">
          <span>{S.create.username}</span>
          <input
            type="text"
            value={username}
            maxLength={32}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <p className="app__users-hint">{S.create.usernameHint}</p>

        <label className="app__field">
          <span>{S.create.name}</span>
          <input
            type="text"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="app__field">
          <span>{S.create.email}</span>
          <input
            type="email"
            value={email}
            maxLength={120}
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <PermissionChecklist held={permissions} toggle={toggle} />

        <label className="app__users-check">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          <span>{S.create.sharedLabel}</span>
        </label>
      </Sheet>
    </div>
  )
}

/** One checkbox per word in the vocabulary. Never a re-typed list. */
export function PermissionChecklist({
  held,
  toggle,
}: {
  held: readonly Permission[]
  toggle: (permission: Permission) => void
}) {
  return (
    <fieldset className="app__perm-list">
      <legend className="app__sr-only">{S.permissions.title}</legend>
      {allPermissionChips().map((chip) => (
        <label key={chip.key} className="app__perm-item">
          <input
            type="checkbox"
            checked={held.includes(chip.key)}
            onChange={() => toggle(chip.key)}
          />
          <span className="app__perm-text">
            <b>{chip.label}</b>
            <small>{chip.hint}</small>
          </span>
        </label>
      ))}
    </fieldset>
  )
}
