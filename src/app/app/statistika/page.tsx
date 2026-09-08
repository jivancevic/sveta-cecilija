import Link from 'next/link'
import { redirect } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { getSeasonStats } from '@/lib/app/stats-data'
import { resolveAppViewer } from '@/lib/app/viewer'
import { LogoutButton } from '../LogoutButton'
import { StatsTable } from './StatsTable'

// `/app/statistika` — the season scoreboard (#437, ADR-0024 phase 4).
//
// Every moreškant sees the whole table (story 37): the numbers are the
// society's, not anybody's private record, and a scoreboard only one person
// could read would not be one. The access decision is the same as the rest of
// `/app` — a voditelj or a live dancer — and a denied account is redirected to
// `/app`, where the existing "Nemate pristup" page explains itself.
//
// The season comes from `?sezona=YYYY`; an unknown or mistyped year falls back
// to the current one in the loader, so a bad bookmark shows this year's table
// rather than an error.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function StatistikaPage({
  searchParams,
}: {
  searchParams: Promise<{ sezona?: string | string[] }>
}) {
  const viewer = await resolveAppViewer()
  if (!viewer.signedIn) redirect('/app/login')
  if (viewer.access.kind === 'denied') redirect('/app')

  const params = await searchParams
  const requested = Array.isArray(params.sezona) ? params.sezona[0] : params.sezona
  const stats = await getSeasonStats(requested)

  return (
    <div className="app__shell">
      <header className="app__header">
        <div>
          <Link className="app__back" href="/app">
            {APP_STRINGS.stats.back}
          </Link>
          <h1 className="app__brand">{APP_STRINGS.stats.title}</h1>
        </div>
        <LogoutButton />
      </header>

      {stats.confirmedPerformances === 0 && <p className="app__empty">{APP_STRINGS.stats.empty}</p>}

      <StatsTable rows={stats.rows} season={stats.season} seasons={stats.seasons} />
    </div>
  )
}
