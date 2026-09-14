import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getSeasonStats } from '@/lib/app/stats-data'
import { getDancerProfile } from '@/lib/app/dancer-season-data'
import { profileRings } from '@/lib/app/profile-rings'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../../../AppShell'
import { openScreen } from '../../../gate'
import { DancerProfileView } from '../DancerProfileView'

// `/app/leaderboard/[memberId]` — one moreškant's season (#608).
//
// **Under Ljestvica, behind the same gate**, which is the whole reason it lives
// here rather than beside Članovi: `openScreen('leaderboard')` already admits a
// `moreskant` and a `moreska` holder and nobody else, so the profile inherits an
// access decision instead of adding one. Članovi keeps its own job — editing
// the roster, `moreska` only — and this screen keeps the season.
//
// A voditelj who wants to edit the person goes to Članovi; nothing here writes.
//
// The reader's own Moja sezona renders the same component from the panel next
// door, with one block more. The difference is a prop, not a second screen.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function DancerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>
  searchParams: Promise<{ season?: string | string[] }>
}) {
  const { viewer, refusal } = await openScreen('leaderboard')
  if (refusal) return refusal

  const { memberId } = await params
  const requested = await searchParams
  const stats = await getSeasonStats(
    Array.isArray(requested.season) ? requested.season[0] : requested.season,
  )

  const profile = await getDancerProfile(memberId, stats.season, stats.seasons)
  // Not a moreškant, or not a Member at all. A comp-attribution row has no
  // season, and inventing an empty one for it would turn a bookkeeping name
  // into a dancer.
  if (!profile) notFound()

  const mine = viewer.me != null && String(viewer.me.id) === profile.identity.memberId

  return (
    <AppShell
      viewer={viewer}
      screen="leaderboard"
      title={APP_STRINGS.profile.title(profile.identity.nickname ?? profile.identity.name)}
      season={stats.season}
    >
      <Link
        className="ui-btn ui-btn--link app__lb-back"
        href={`/app/leaderboard?season=${stats.season}&part=all`}
      >
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        {APP_STRINGS.profile.back}
      </Link>

      <DancerProfileView
        profile={profile}
        rings={profileRings({ stats, memberId: profile.identity.memberId, mine })}
        // Even on the reader's own row, reached from the board: the standing
        // sentence belongs to the Moja sezona panel, which is where a dancer
        // goes to read about themselves. Here the screen is "a profile", and it
        // is the same one whoever is on it.
        mine={mine}
        standing={null}
        movement={null}
      />
    </AppShell>
  )
}
