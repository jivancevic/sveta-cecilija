import Link from 'next/link'
import { redirect } from 'next/navigation'
import { accessMember } from '@/lib/app/access'
import { getSeasonPerformances } from '@/lib/app/roster-data'
import { APP_STRINGS, ROLE_LABELS } from '@/lib/app/strings'
import type { DanceRole } from '@/lib/moreskant-profile'
import { resolveAppViewer } from '@/lib/app/viewer'
import { vapidPublicKey } from '@/lib/push/vapid'
import { calendarFeedUrl } from '@/lib/calendar/feed'
import { CalendarPanel } from './CalendarPanel'
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
        <Link className="app__link" href="/admin">
          {APP_STRINGS.denied.adminLink}
        </Link>
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
  const voditelj = viewer.access.kind === 'voditelj'
  const season = await getSeasonPerformances({ memberId: me?.id ?? null, voditelj })

  // The shared feed (#433). Both halves are server facts handed down as one
  // prop: a deployment missing either simply shows no panel, rather than a
  // "Kalendar" heading over a broken link.
  const calendarUrl = calendarFeedUrl(
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.CALENDAR_FEED_TOKEN,
  )

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
        {/* The way to the scoreboard (#437). One link rather than a nav bar:
            `/app` has two destinations and a bar for two is chrome. */}
        <Link className="app__link app__season-link" href="/app/statistika">
          {APP_STRINGS.stats.link}
        </Link>
      </p>

      <PerformanceList
        upcoming={season.upcoming}
        past={season.past}
        memberId={me?.id ?? null}
        voditelj={voditelj}
      />

      {/* The public VAPID key is a server fact handed to the client as a prop
          rather than a NEXT_PUBLIC_ twin of the same value (#431): one name for
          one key means the operator cannot set half of a pair. */}
      <InstallHint vapidPublicKey={vapidPublicKey()} />

      {calendarUrl && <CalendarPanel url={calendarUrl} />}
    </div>
  )
}
