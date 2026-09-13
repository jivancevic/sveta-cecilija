import Link from 'next/link'
import { APP_STRINGS } from '@/lib/app/strings'
import { loadAccounts } from '@/lib/app/users-data'
import { displayName, emailLabel, filterAccounts, permissionChips, sortAccounts } from '@/lib/app/users-view'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { NewUserForm } from './NewUserForm'
import { UsersSearch } from './UsersSearch'

// `/app/users` — Korisnici (#510), the accounts and what each may do.
//
// The screen the Backoffice could never be: eighteen logins whose whole meaning
// is a permission set, listed as Croatian words instead of as
// `['tickets','refunds']`, with the shared flag and both links visible on the
// row rather than three clicks inside a collection nobody but the developer
// opens.
//
// Everything is in one page because there is no volume here to page through:
// the society has fewer accounts than a phone screen has rows, so the search
// box filters an already-loaded list rather than re-querying. The query string
// still carries it, the way Narudžbe and Upiti do, so a reload keeps the place
// and the back button works.
//
// Deleting an account is deliberately absent and says so at the foot of the
// detail: that stays Backoffice work (#476). The way to end a login here is to
// take every permission off it, which leaves the history it wrote intact.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.users

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { viewer, refusal } = await openScreen('users')
  if (refusal) return refusal

  const params = await searchParams
  const raw = params.q
  const q = (Array.isArray(raw) ? raw[0] : raw) ?? ''

  const accounts = sortAccounts(await loadAccounts())
  const rows = filterAccounts(accounts, q)

  return (
    <AppShell viewer={viewer} screen="users">
      <UsersSearch q={q} />

      <p className="app__users-count" aria-live="polite">
        {S.found(rows.length)}
      </p>

      {rows.length === 0 ? (
        <p className="app__empty">{S.empty}</p>
      ) : (
        <div className="app__users-list">
          {rows.map((account) => {
            const name = displayName(account)
            return (
              <Link key={account.id} className="app__user-row" href={`/app/users/${account.id}`}>
                <span className="app__user-head">
                  <span className="app__user-name">{account.username ?? account.id}</span>
                  <span className="app__user-badges">
                    {account.id === viewer.userId && (
                      <span className="app__badge">{S.selfBadge}</span>
                    )}
                    {account.shared && (
                      <span className="app__badge app__badge--shared">{S.sharedBadge}</span>
                    )}
                  </span>
                </span>

                <span className="app__user-sub">
                  {name && <b>{name}</b>}
                  <span className={account.email ? undefined : 'app__user-noemail'}>
                    {emailLabel(account.email)}
                  </span>
                </span>

                <span className="app__user-chips">
                  {permissionChips(account.permissions).map((chip) => (
                    <span key={chip.key} className="app__chip">
                      {chip.label}
                    </span>
                  ))}
                  {account.permissions.length === 0 && (
                    <span className="app__chip app__chip--none">{S.noPermissions}</span>
                  )}
                </span>

                {(account.partnerName || account.memberName) && (
                  <span className="app__user-links">
                    {account.partnerName && (
                      <span>
                        {S.partnerLabel}: <b>{account.partnerName}</b>
                      </span>
                    )}
                    {account.memberName && (
                      <span>
                        {S.memberLabel}: <b>{account.memberName}</b>
                      </span>
                    )}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}

      <NewUserForm />
    </AppShell>
  )
}
