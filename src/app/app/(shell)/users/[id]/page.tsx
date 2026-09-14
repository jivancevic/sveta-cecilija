import Link from 'next/link'
import { screenByKey } from '@/lib/app/screens'
import { APP_STRINGS } from '@/lib/app/strings'
import {
  loadAccount,
  loadMemberCandidates,
  loadPartnerOptions,
  loadTabOptions,
} from '@/lib/app/users-data'
import { displayName, emailLabel, permissionChips } from '@/lib/app/users-view'
import { AppShell } from '../../../AppShell'
import { openScreen } from '../../../gate'
import { Card, Chip } from '../../../ui'
import { UserActions } from './UserActions'

// `/app/users/[id]` — one account (#510).
//
// The facts first, then the seven named actions, and on a laptop the two side by
// side (#573, Q51): what this account IS on the left, what can be done to it on
// the right. The facts are the ones that decide access: the permission set as
// Croatian chips, the address (or its absence, which is what decides how a
// password is handed over), the shared flag and the two links by name.
//
// Deleting stays in the Backoffice and the page says so at the foot, with no
// link unless the reader holds `dev`: telling somebody a capability exists
// elsewhere is honest, and handing every `users` holder a link into the raw
// collection editor is what this screen was built to stop.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.users

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="app__user-fact">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  )
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { viewer, refusal } = await openScreen('users')
  if (refusal) return refusal

  const { id } = await params
  const account = await loadAccount(id)

  if (!account) {
    return (
      <AppShell viewer={viewer} screen="users" title={S.missing}>
        <p className="app__empty">{S.missing}</p>
        <Link className="app__button app__button--link" href="/app/users">
          {S.back}
        </Link>
      </AppShell>
    )
  }

  // The two pickers, loaded on the server so the sheets open with their list
  // already in them: a picker that fetches on open is a spinner in the middle
  // of a decision.
  const [partners, candidates, tabOptions] = await Promise.all([
    loadPartnerOptions(),
    loadMemberCandidates(),
    // The screens this account may carry in its bar (#563), by the same rule
    // the PATCH behind the sheet applies.
    loadTabOptions(account),
  ])

  const name = displayName(account)
  const self = account.id === viewer.userId

  return (
    <AppShell viewer={viewer} screen="users" title={name || account.username || account.id}>
      <Link className="app__user-back" href="/app/users">
        ‹ {S.back}
      </Link>

      <div className="app__cols">
        <Card className="app__user-facts">
          <Fact label={S.create.username}>
            {account.username ?? account.id}
            {self && <Chip tone="gold">{S.selfBadge}</Chip>}
          </Fact>
          {/* The account's OWN name, not `displayName`: that one falls back to
              the linked dancer or reseller, and this row is the one Ime edits,
              so an empty one has to read as empty (#617). */}
          <Fact label={S.create.name}>
            {account.name?.trim() || (
              <span className="app__user-noemail">{S.name.none}</span>
            )}
          </Fact>
          <Fact label={S.create.email}>
            <span className={account.email ? undefined : 'app__user-noemail'}>
              {emailLabel(account.email)}
            </span>
          </Fact>
          <Fact label={S.permissions.title}>
            <span className="app__user-chips">
              {permissionChips(account.permissions).map((chip) => (
                <span key={chip.key} className="app__user-chip">
                  {chip.label}
                </span>
              ))}
              {account.permissions.length === 0 && (
                <span className="app__user-chip app__user-chip--none">{S.noPermissions}</span>
              )}
            </span>
          </Fact>
          <Fact label={S.shared.title}>
            {account.shared ? S.shared.isShared : S.shared.isPersonal}
          </Fact>
          <Fact label={S.tabs.title}>
            {account.tabs.length === 0
              ? S.tabs.none
              : account.tabs.map((key) => screenByKey(key).label).join(' · ')}
          </Fact>
          <Fact label={S.partnerLabel}>{account.partnerName ?? S.link.partnerNone}</Fact>
          <Fact label={S.memberLabel}>{account.memberName ?? S.link.memberNone}</Fact>
        </Card>

        <UserActions
          account={account}
          self={self}
          partners={partners.map((p) => ({ id: p.id, label: p.name }))}
          candidates={candidates.map((c) => ({
            id: c.id,
            label: c.nickname ? `${c.nickname} (${c.name})` : c.name,
          }))}
          tabOptions={tabOptions}
        />
      </div>

      <p className="app__user-note">{S.deleteNote}</p>
      {viewer.permissions.includes('dev') && (
        <p className="app__user-note">
          <a href={`/admin/collections/users/${account.id}`}>Backoffice</a>
        </p>
      )}
    </AppShell>
  )
}
