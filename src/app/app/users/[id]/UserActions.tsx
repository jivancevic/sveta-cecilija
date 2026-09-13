'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Permission } from '@/lib/access/permissions'
import { APP_STRINGS } from '@/lib/app/strings'
import type { Handover } from '@/lib/app/users-account'
import type { UserAccount } from '@/lib/app/users-view'
import { PermissionChecklist } from '../NewUserForm'
import { HandoverPanel, Sheet } from '../UserSheet'

// The five named actions of one account (#510, #476's "named actions only").
//
// Each is a button with a verb on it and a confirmation under it, never a raw
// edit form, because each of them changes who can do what: a permission set
// reaches every screen in this app, a link decides whose roster identity a
// login is, and a reset hands somebody a live way in.
//
// Nothing here is optimistic. Every refusal on this screen is a server rule
// (the lockout guard, the e-mail policy, `taken`), so the honest answer only
// exists after the response; a success calls `router.refresh()` and the facts
// above re-render from the database.
//
// The two handover actions do NOT close their sheet on success: they turn into
// the panel that shows the credential once and wait for Gotovo.

const S = APP_STRINGS.users

type Which = 'permissions' | 'reset' | 'partner' | 'member' | 'shared' | null

export interface PickerOption {
  id: string
  label: string
}

export function UserActions({
  account,
  self,
  partners,
  candidates,
}: {
  account: UserAccount
  /** Is this the reader's own login? Three refusals hang off it. */
  self: boolean
  partners: PickerOption[]
  candidates: PickerOption[]
}) {
  const router = useRouter()
  const [sheet, setSheet] = useState<Which>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [handover, setHandover] = useState<Handover | null>(null)

  const [permissions, setPermissions] = useState<Permission[]>([...account.permissions])
  const [partnerId, setPartnerId] = useState(account.partnerId ?? '')
  const [memberId, setMemberId] = useState(account.memberId ?? '')

  function open(which: Which) {
    setSheet(which)
    setError(null)
    setDone(null)
    setHandover(null)
    setPermissions([...account.permissions])
    setPartnerId(account.partnerId ?? '')
    setMemberId(account.memberId ?? '')
  }

  function close() {
    setSheet(null)
    setHandover(null)
    setError(null)
    router.refresh()
  }

  /** One request, and the Croatian sentence it can fail with. */
  async function call(
    url: string,
    init: RequestInit,
    fallback: string,
  ): Promise<{ ok: boolean; body: Record<string, unknown> | null }> {
    if (busy) return { ok: false, body: null }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, init)
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok) {
        // Every route on this screen is ours, so its refusals are already the
        // Croatian sentences in `users-admin.ts` / `users-account.ts` /
        // `users-link.ts`, and each names the repair.
        setError((body?.error as string) ?? fallback)
        return { ok: false, body }
      }
      return { ok: true, body }
    } catch {
      setError(fallback)
      return { ok: false, body: null }
    } finally {
      setBusy(false)
    }
  }

  const json = (payload: unknown, method = 'POST'): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  async function savePermissions() {
    const res = await call(
      `/api/app/users/${account.id}/permissions`,
      json({ permissions }, 'PATCH'),
      S.permissions.failed,
    )
    if (!res.ok) return
    setDone((res.body?.message as string) ?? S.permissions.saved)
    setSheet(null)
    router.refresh()
  }

  async function resetPassword() {
    const res = await call(
      `/api/app/users/${account.id}/reset-password`,
      json({}),
      S.reset.failed,
    )
    if (!res.ok) return
    setHandover((res.body?.handover as Handover) ?? { kind: 'none' })
  }

  async function saveLink(field: 'partner' | 'member', value: string) {
    const res = await call(
      `/api/app/users/${account.id}/link`,
      json({ [field]: value === '' ? null : value }),
      S.link.failed,
    )
    if (!res.ok) return
    setDone(S.link.saved)
    setSheet(null)
    router.refresh()
  }

  async function saveShared(next: boolean) {
    const res = await call(`/api/app/users/${account.id}/shared`, json({ shared: next }), S.shared.failed)
    if (!res.ok) return
    setDone(S.shared.saved)
    setSheet(null)
    router.refresh()
  }

  return (
    <section className="app__user-actions">
      {done && <p className="app__user-done">{done}</p>}

      <div className="app__user-buttons">
        <button type="button" className="app__button" onClick={() => open('permissions')}>
          {S.actions.permissions}
        </button>
        <button type="button" className="app__button" onClick={() => open('reset')}>
          {S.actions.resetPassword}
        </button>
        <button type="button" className="app__button app__button--link" onClick={() => open('partner')}>
          {S.actions.linkPartner}
        </button>
        <button type="button" className="app__button app__button--link" onClick={() => open('member')}>
          {S.actions.linkMember}
        </button>
        <button type="button" className="app__button app__button--link" onClick={() => open('shared')}>
          {S.actions.shared}
        </button>
      </div>

      {sheet === 'permissions' && (
        <Sheet
          title={S.permissions.title}
          body={S.permissions.body}
          error={error}
          busy={busy}
          confirm={() => void savePermissions()}
          close={close}
        >
          <PermissionChecklist
            held={permissions}
            toggle={(p) =>
              setPermissions((held) =>
                held.includes(p) ? held.filter((x) => x !== p) : [...held, p],
              )
            }
          />
          {/* The lockout guard, said before it refuses: the reader is looking
              at their own row and the box they must not untick. */}
          {self && <p className="app__sheet-warn">{S.permissions.selfLockout}</p>}
        </Sheet>
      )}

      {sheet === 'reset' &&
        (handover ? (
          <HandoverPanel handover={handover} close={close} />
        ) : (
          <Sheet
            title={S.reset.title}
            body={account.email ? S.reset.bodyEmail : S.reset.bodyNoEmail}
            error={error}
            busy={busy}
            confirm={() => void resetPassword()}
            close={close}
          />
        ))}

      {sheet === 'partner' && (
        <Sheet
          title={S.link.partnerTitle}
          body={S.link.partnerBody}
          error={error}
          busy={busy}
          confirm={() => void saveLink('partner', partnerId)}
          close={close}
        >
          {partners.length === 0 && !account.partnerId ? (
            <p className="app__sheet-warn">{S.link.partnerEmpty}</p>
          ) : (
            <label className="app__field">
              <span>{S.partnerLabel}</span>
              <select
                className="app__select app__select--wide"
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
              >
                <option value="">{S.link.partnerNone}</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Sheet>
      )}

      {sheet === 'member' && (
        <Sheet
          title={S.link.memberTitle}
          body={S.link.memberBody}
          error={error}
          busy={busy}
          confirm={() => void saveLink('member', memberId)}
          close={close}
        >
          {candidates.length === 0 && !account.memberId ? (
            <p className="app__sheet-warn">{S.link.memberEmpty}</p>
          ) : (
            <label className="app__field">
              <span>{S.memberLabel}</span>
              <select
                className="app__select app__select--wide"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              >
                <option value="">{S.link.memberNone}</option>
                {/* The currently linked dancer is not on the candidate list
                    (they have a login: this one), so the row is added back
                    here or unlinking would be the only possible answer. */}
                {account.memberId && (
                  <option value={account.memberId}>{account.memberName ?? account.memberId}</option>
                )}
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Sheet>
      )}

      {sheet === 'shared' && (
        <Sheet
          title={S.shared.title}
          body={account.shared ? S.shared.bodyOn : S.shared.bodyOff}
          error={error}
          busy={busy}
          confirm={self ? null : () => void saveShared(!account.shared)}
          confirmLabel={account.shared ? S.shared.off : S.shared.on}
          close={close}
        >
          {self && <p className="app__sheet-warn">{S.shared.notSelf}</p>}
        </Sheet>
      )}
    </section>
  )
}
