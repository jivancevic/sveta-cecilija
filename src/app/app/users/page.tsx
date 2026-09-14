import { APP_STRINGS } from '@/lib/app/strings'
import { loadAccounts } from '@/lib/app/users-data'
import {
  displayName,
  emailLabel,
  filterAccounts,
  permissionPills,
  sortAccounts,
} from '@/lib/app/users-view'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { Card, Chip, List, ListRow, Section } from '../ui'
import { NewUserForm } from './NewUserForm'
import { UsersSearch } from './UsersSearch'

// `/app/users` — Korisnici (#510), the accounts and what each may do.
//
// The screen the Backoffice could never be: eighteen logins whose whole meaning
// is a permission set, listed as Croatian words instead of as
// `['tickets','refunds']`, with the shared flag visible on the row rather than
// three clicks inside a collection nobody but the developer opens.
//
// **The person first, the login second** (#573, Q47): a row is somebody, and
// the username is how they sign in. A shared account has no person, so its
// username IS the first line and the "Zajednički" chip beside it says why. The
// set reads as three soft pills and a "+8", because eleven pills on a row is a
// paragraph and the whole set is one tap away on the detail.
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
      <div className="app__col">
        <UsersSearch q={q} />

        <Section title={S.listTitle} aside={<span aria-live="polite">{S.found(rows.length)}</span>} />

        {rows.length === 0 ? (
          <Card className="app__empty">
            <p>{S.empty}</p>
          </Card>
        ) : (
          <List className="app__users-list">
            {rows.map((account) => {
              const name = displayName(account)
              const { pills, extra } = permissionPills(account.permissions)
              return (
                <ListRow
                  key={account.id}
                  href={`/app/users/${account.id}`}
                  title={
                    <>
                      {name || account.username || account.id}
                      {account.id === viewer.userId && <Chip tone="gold">{S.selfBadge}</Chip>}
                      {account.shared && <Chip>{S.sharedBadge}</Chip>}
                    </>
                  }
                  // The login under the person. A row with no person is
                  // already titled with its username, so the second line says
                  // the other thing that decides how it is handed over.
                  meta={name ? (account.username ?? account.id) : emailLabel(account.email)}
                  trail={
                    <span className="app__user-pills">
                      {pills.map((chip) => (
                        <span key={chip.key} className="app__user-pill">
                          {chip.label}
                        </span>
                      ))}
                      {extra > 0 && <span className="app__user-pill">+{extra}</span>}
                      {account.permissions.length === 0 && (
                        <span className="app__user-pill app__user-pill--none">
                          {S.noPermissions}
                        </span>
                      )}
                    </span>
                  }
                />
              )
            })}
          </List>
        )}

        <NewUserForm />
      </div>
    </AppShell>
  )
}
