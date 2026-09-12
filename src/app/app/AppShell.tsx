import type { AppMember } from '@/lib/app/access'
import { APP_STRINGS, ROLE_LABELS } from '@/lib/app/strings'
import type { DanceRole } from '@/lib/moreskant-profile'
import { TabBar } from './TabBar'

// The chrome every tab page wears (#457): the header, the content, the bar.
//
// A server component with one client island (the bar), so a tab page stays what
// it was — server-rendered roster data with no store and no hydration cost
// beyond the three links.
//
// "Odjava" is NOT in the header any more: it moved to Više, where the things a
// dancer does once a season live. A header button that ends the session sitting
// one thumb-width from the season label was a mis-tap waiting to happen.

/** "Cici · Crni kralj, Crni" — the small identity line of story 36. */
export function identityLine(member: {
  nickname?: string | null
  roles?: string[]
  primaryRole?: string | null
}): string {
  const ordered = [
    ...(member.primaryRole ? [member.primaryRole] : []),
    ...(member.roles ?? []).filter((r) => r !== member.primaryRole),
  ]
  const labels = ordered.map((r) => ROLE_LABELS[r as DanceRole] ?? r)
  return labels.length > 0 ? labels.join(', ') : APP_STRINGS.header.noRoles
}

export function AppShell({
  me,
  season,
  header,
  children,
}: {
  me: AppMember | null
  /** The season label on the right of the header; omitted where it means nothing. */
  season?: number | null
  /**
   * A page that introduces itself (the performance detail, #457) passes its own
   * header and the brand line steps aside: one screen, one title, and the app's
   * name is already on the tab bar underneath.
   */
  header?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      <div className="app__shell">
        {header ?? (
          <header className="app__header">
            <div>
              <h1 className="app__brand">{APP_STRINGS.name}</h1>
              {me?.nickname && (
                <p className="app__identity">
                  <strong>{me.nickname}</strong> · {identityLine(me)}
                </p>
              )}
            </div>
            {season != null && (
              <p className="app__season">
                {APP_STRINGS.list.season} {season}
              </p>
            )}
          </header>
        )}

        {children}
      </div>

      <TabBar />
    </>
  )
}
