import type { Metadata } from 'next'
import { Bell, ChevronRight, KeyRound, LayoutGrid, Sparkles, Smartphone, UserRound } from 'lucide-react'
import { armyOfPrimaryRole } from '@/lib/app/leaderboard-rank'
import { APP_STRINGS } from '@/lib/app/strings'
import { permissionChips } from '@/lib/app/users-view'
import { APP_VERSION, versionLine } from '@/lib/app/version'
import { deployedCommit } from '@/lib/health/health'
import { Chip, List, ListRow, RoleMark, ScreenIcon, Section } from '../ui'
import { AppShell, identityLine } from '../AppShell'
import { LogoutButton } from '../LogoutButton'
import { openScreen } from '../gate'
import { SupportRow } from './SupportRow'

// `/app/more` — Više (#457, generalised by #495, reskinned by #569).
//
// **It opens with the person, not with a list.** Who is holding this phone is
// the question every row under it answers something about, and until #569 the
// screen never said: a voditelj and the `tehnika` tablet saw the same eleven
// rows in the same order. So the top of the screen is the reader — their mark
// and their name — and everything else is what they can do about it.
//
// Four groups, in this order:
//
//  1. **The person**: the mark (a moreškant's army, from their primary role) or
//     the permission set as Croatian chips, and the name. A shared login is
//     nobody in particular (ADR-0022), so it is named by its username and wears
//     the chip that says so, rather than being greeted like a person.
//  2. **Their own four rows**: Profil, Obavijesti, Sigurnost, Podrška. Two of
//     them are `/app/account` — the screen is one screen and Sigurnost is an
//     anchor into it, because a second route for a form that is already on a
//     screen would be a URL that exists to be a row.
//  3. **The overflow**: every screen this person unlocks that did not fit their
//     three tabs, with the same icon its tab would carry. It is computed, not
//     written down (`nav.overflow`), so a secretary who is given one more
//     permission finds the new screen here without anybody editing this file.
//  4. **The app itself**: the walkthrough, the install guide, and for a `dev`
//     holder the Backoffice. No `/admin` link for anybody else (#473): raw
//     Payload is a developer's tool, and Cecilija is what everyone else works in.
//
// Then Odjava, and then the build. **The version line names the same commit
// `/api/health` reports** (the ticket's acceptance criterion): one reader,
// `deployedCommit()`, so "which build am I looking at" has one answer whether it
// is asked by a voditelj on a phone or by curl.
//
// The calendar moved OUT of this screen with #569: subscribing to the izvedbe
// is something you do once, and it now sits under the notifications it is a
// quieter form of.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.screens.more} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

const S = APP_STRINGS.more

/** The chevron every tappable row wears on its right. */
function Chev() {
  return (
    <span className="app__row-chev" aria-hidden="true">
      <ChevronRight size={20} strokeWidth={1.75} />
    </span>
  )
}

/** The 44px slot a row's icon sits in, so the four lists line up. */
function RowIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="app__row-icon" aria-hidden="true">
      {children}
    </span>
  )
}

export default async function MorePage() {
  const { viewer, refusal } = await openScreen()
  if (refusal) return refusal

  const dev = viewer.permissions.includes('dev')
  const me = viewer.me

  // Whom this login belongs to, in the order the answer is most likely to be
  // right, and a shared login ends on its username: `tehnika` is what the
  // tablet on the wall is called out loud.
  const name = viewer.accountName ?? me?.name ?? me?.nickname ?? viewer.username ?? APP_STRINGS.name

  // The mark is the army of the reader's PRIMARY role and carries no title:
  // a title belongs to an evening, not to a person (glossary: *Title*), and
  // there is no evening on this screen.
  const army = me ? armyOfPrimaryRole(me.primaryRole) : null

  // A dancer is named by what they dance; everybody else by what they may do.
  // The Croatian for a permission is Korisnici's, read rather than re-typed:
  // eleven words gate this whole app and two spellings of "blagajna" would be
  // two answers to what one account is.
  const chips = me ? [] : permissionChips(viewer.permissions)

  const unread = viewer.unreadNotifications

  return (
    <AppShell viewer={viewer} screen="more">
      <div className="app__me">
        {me && <RoleMark army={army} title={null} />}
        <div className="app__me-body">
          <h2>{name}</h2>
          {me && <p>{identityLine(me)}</p>}
        </div>
      </div>

      {(viewer.shared || chips.length > 0) && (
        <div className="app__me-chips">
          {viewer.shared && <Chip>{S.shared}</Chip>}
          {chips.map((chip) => (
            <Chip key={chip.key} title={chip.hint}>
              {chip.label}
            </Chip>
          ))}
        </div>
      )}

      <List className="app__more-list">
        <ListRow
          href="/app/account"
          lead={
            <RowIcon>
              <UserRound size={22} strokeWidth={1.75} />
            </RowIcon>
          }
          title={S.accountRow}
          trail={<Chev />}
        />
        <ListRow
          href="/app/notifications"
          lead={
            <RowIcon>
              <Bell size={22} strokeWidth={1.75} />
            </RowIcon>
          }
          title={APP_STRINGS.notifications.title}
          trail={
            unread > 0 ? (
              <Chip tone="gold">{unread > 99 ? APP_STRINGS.notifications.badgeOverflow : unread}</Chip>
            ) : (
              <Chev />
            )
          }
        />
        {/* An anchor into Profil rather than a route of its own: the password
            form is already a section down there, and a second URL for it would
            exist only so that this row could link somewhere. */}
        <ListRow
          href="/app/account#security"
          lead={
            <RowIcon>
              <KeyRound size={22} strokeWidth={1.75} />
            </RowIcon>
          }
          title={S.security}
          trail={<Chev />}
        />
        <SupportRow />
      </List>

      {viewer.nav.overflow.length > 0 && (
        <section className="app__more-group">
          <Section title={S.screensTitle} />
          <List>
            {viewer.nav.overflow.map((screen) => (
              <ListRow
                key={screen.key}
                href={screen.route}
                lead={
                  <RowIcon>
                    <ScreenIcon screen={screen.key} size={22} />
                  </RowIcon>
                }
                title={screen.label}
                trail={<Chev />}
              />
            ))}
          </List>
        </section>
      )}

      <section className="app__more-group">
        <Section title={S.appTitle} />
        <List>
          {/* The walkthrough, replayable, and only for somebody it was written
              for: it talks about evenings and postave, and the route map shows
              it to a dancer (#473). The page sets the cookie only when it is
              finished or skipped, so opening it again changes nothing. */}
          {me && (
            <ListRow
              href="/app/welcome"
              lead={
                <RowIcon>
                  <Sparkles size={22} strokeWidth={1.75} />
                </RowIcon>
              }
              title={S.onboarding}
              trail={<Chev />}
            />
          )}
          {/* The same guide the Dobrodošlica's first step shows, full screen
              (#455). It lives here too because a dancer who skipped the
              walkthrough, or who is holding somebody else's phone at a
              rehearsal, needs a way back to it that is not three steps long. */}
          <ListRow
            href="/app/install"
            lead={
              <RowIcon>
                <Smartphone size={22} strokeWidth={1.75} />
              </RowIcon>
            }
            title={S.install}
            trail={<Chev />}
          />
          {dev && (
            // The Backoffice is a different app under the same origin, so this
            // is a plain navigation rather than a client transition.
            <ListRow
              href="/admin"
              prefetch={false}
              lead={
                <RowIcon>
                  <LayoutGrid size={22} strokeWidth={1.75} />
                </RowIcon>
              }
              title={S.admin}
              trail={<Chev />}
            />
          )}
        </List>
      </section>

      <div className="app__more-logout">
        {/* Ghost, not destructive: signing out deletes nothing, and red is
            reserved for what cannot be undone. */}
        <LogoutButton className="ui-btn ui-btn--ghost" />
      </div>

      <footer className="app__build">
        <p>{versionLine({ version: APP_VERSION, commit: deployedCommit() })}</p>
        <p className="app__build-credit">{S.createdBy}</p>
      </footer>
    </AppShell>
  )
}
