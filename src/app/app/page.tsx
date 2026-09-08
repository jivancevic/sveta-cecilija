import { redirect } from 'next/navigation'
import { accessMember } from '@/lib/app/access'
import { getSeasonPerformances } from '@/lib/app/roster-data'
import { APP_STRINGS, ROLE_LABELS } from '@/lib/app/strings'
import type { DanceRole } from '@/lib/moreskant-profile'
import { resolveAppViewer } from '@/lib/app/viewer'
import { InstallHint } from './InstallHint'
import { LogoutButton } from './LogoutButton'
import { PerformanceList } from './PerformanceList'

// `/app` — the season's performances as cards (#421, ADR-0024 phase 3).
//
// Anonymous → /app/login. Signed in but not on the roster → "Nemate pristup"
// with a link to the admin, because a wrong bookmark should explain itself
// rather than show a blank screen (#419, story 37). Attendance buttons are #422.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function DeniedPage() {
  return (
    <main className="app__panel">
      <h1>{APP_STRINGS.denied.title}</h1>
      <p>{APP_STRINGS.denied.body}</p>
      <p>
        <a className="app__link" href="/admin">
          {APP_STRINGS.denied.adminLink}
        </a>
      </p>
      <LogoutButton className="app__button" />
    </main>
  )
}

/** "Cici · Crni kralj, Crni" — the small identity line of story 36. */
function identityLine(member: { nickname?: string | null; roles?: string[]; primaryRole?: string | null }) {
  const ordered = [
    ...(member.primaryRole ? [member.primaryRole] : []),
    ...(member.roles ?? []).filter((r) => r !== member.primaryRole),
  ]
  const labels = ordered.map((r) => ROLE_LABELS[r as DanceRole] ?? r)
  return labels.length > 0 ? labels.join(', ') : APP_STRINGS.header.noRoles
}

export default async function MoreskantHomePage() {
  const viewer = await resolveAppViewer()
  if (!viewer.signedIn) redirect('/app/login')
  if (viewer.access.kind === 'denied') return <DeniedPage />

  const me = accessMember(viewer.access)
  const season = await getSeasonPerformances()

  return (
    <div className="app__shell">
      <header className="app__header">
        <div>
          <h1 className="app__brand">{APP_STRINGS.name}</h1>
          {me?.nickname && (
            <p className="app__identity">
              <strong>{me.nickname}</strong> · {identityLine(me)}
            </p>
          )}
        </div>
        <LogoutButton />
      </header>

      <p className="app__season">
        {APP_STRINGS.list.season} {season.year}
      </p>

      <PerformanceList upcoming={season.upcoming} past={season.past} />

      <InstallHint />
    </div>
  )
}
