'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Permission } from '@/lib/access/permissions'
import { MAX_TABS, type AppScreenKey } from '@/lib/app/screens'
import { APP_STRINGS } from '@/lib/app/strings'
import type { Handover } from '@/lib/app/users-account'
import type { TabOption } from '@/lib/app/users-data'
import type { UserAccount } from '@/lib/app/users-view'
import { Button, Chip, Sheet as UiSheet, SheetOption, Toast } from '../../ui'
import { PermissionChecklist } from '../NewUserForm'
import { HandoverPanel, Sheet } from '../UserSheet'

// The six named actions of one account (#510, #563; #476's "named actions
// only").
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

type Which = 'permissions' | 'reset' | 'partner' | 'member' | 'shared' | 'tabs' | null

export interface PickerOption {
  id: string
  label: string
}

/** The Croatian name of a chosen screen, from the list the server sent. */
function labelOf(options: TabOption[], key: AppScreenKey): string {
  return options.find((o) => o.key === key)?.label ?? key
}

export function UserActions({
  account,
  self,
  partners,
  candidates,
  tabOptions,
}: {
  account: UserAccount
  /** Is this the reader's own login? Four refusals hang off it. */
  self: boolean
  partners: PickerOption[]
  candidates: PickerOption[]
  /**
   * The screens this account may carry in its bar, resolved on the server by
   * the same rule the route applies (#563), so the picker can never offer a
   * screen the PATCH then refuses.
   */
  tabOptions: TabOption[]
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
  const [tabs, setTabs] = useState<AppScreenKey[]>([...account.tabs])

  // The toast says it landed and then stops saying it (#562). The state it
  // reads is the same `done` every action already set; only the shape changed.
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(null), 3200)
    return () => clearTimeout(timer)
  }, [done])

  function open(which: Which) {
    setSheet(which)
    setError(null)
    setDone(null)
    setHandover(null)
    setPermissions([...account.permissions])
    setPartnerId(account.partnerId ?? '')
    setMemberId(account.memberId ?? '')
    setTabs([...account.tabs])
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

  /** Add at the end, remove from anywhere: the order IS the bar (#563). */
  function toggleTab(key: AppScreenKey) {
    setTabs((chosen) =>
      chosen.includes(key)
        ? chosen.filter((k) => k !== key)
        : chosen.length >= MAX_TABS
          ? chosen
          : [...chosen, key],
    )
  }

  async function saveTabs() {
    const res = await call(`/api/app/users/${account.id}/tabs`, json({ tabs }, 'PATCH'), S.tabs.failed)
    if (!res.ok) return
    setDone((res.body?.message as string) ?? S.tabs.saved)
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
      {/* One toast, the shape the whole app confirms with since T1 (#562), for
          all six actions rather than a second one for the newest. */}
      <Toast message={done ?? ''} open={done !== null} />

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
        <button type="button" className="app__button app__button--link" onClick={() => open('tabs')}>
          {S.actions.tabs}
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

      {/* The one sheet on this screen that is a CHOICE rather than a
          confirmation, so it is T1's bottom sheet (#562) and not the inline
          panel the five confirmations use. */}
      <UiSheet
        open={sheet === 'tabs'}
        title={S.tabs.title}
        onClose={close}
        // The answer stays put while the options scroll: five screens and a
        // paragraph are taller than a landscape phone (#563).
        footer={
          <>
            {/* The reader's own row says why there is nothing to confirm, and
                the refusal sits with the button it removed. */}
            {self && <p className="app__sheet-warn">{S.tabs.notSelf}</p>}
            {error && <p className="app__error">{error}</p>}
            <div className="app__sheet-buttons">
              {!self && tabOptions.length > 0 && (
                <Button variant="primary" disabled={busy} onClick={() => void saveTabs()}>
                  {busy ? S.actions.working : S.tabs.save}
                </Button>
              )}
              <Button variant="link" disabled={busy} onClick={close}>
                {S.actions.cancel}
              </Button>
            </div>
          </>
        }
      >
        <p className="app__sheet-body">{S.tabs.body}</p>

        {tabOptions.length === 0 ? (
          <p className="app__sheet-warn">{S.tabs.empty}</p>
        ) : (
          <>
            <div className="app__tabs-order">
              <span>{S.tabs.order}</span>
              <span className="app__tabs-chips">
                {tabs.length === 0 ? (
                  <Chip>{S.tabs.none}</Chip>
                ) : (
                  tabs.map((key, index) => (
                    <Chip key={key} tone="gold">
                      {index + 1}. {labelOf(tabOptions, key)}
                    </Chip>
                  ))
                )}
              </span>
            </div>

            {tabOptions.map((option) => {
              const at = tabs.indexOf(option.key)
              const full = at < 0 && tabs.length >= MAX_TABS
              return (
                <SheetOption
                  key={option.key}
                  on={at >= 0}
                  // Full is not a disabled row: it still answers, by taking the
                  // tap that removes something else first.
                  lead={<span className="app__tabs-mark">{at >= 0 ? at + 1 : ''}</span>}
                  note={full ? S.tabs.tooMany(MAX_TABS) : undefined}
                  onClick={() => toggleTab(option.key)}
                >
                  {option.label}
                </SheetOption>
              )
            })}

            <p className="app__tabs-note">
              {S.tabs.count(tabs.length, MAX_TABS)} · {S.tabs.note}
            </p>
          </>
        )}

      </UiSheet>

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
