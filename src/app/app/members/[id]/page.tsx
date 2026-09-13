import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadMember } from '@/lib/app/members-data'
import { shownName } from '@/lib/app/members-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { MemberProfileForm } from './MemberProfileForm'

// `/app/members/[id]` — one dancer's profile (#511).
//
// The Backoffice's Members edit form has eleven fields, six of which a voditelj
// cannot see and two of which they cannot write. This is the six that are
// theirs, on a phone, with the name they may not change shown as a fact rather
// than as a disabled input.
//
// A Member that is only a comp-attribution name (ADR-0019) is a 404 here, the
// same answer an unknown id gets: as far as Članovi is concerned it does not
// exist. `PATCH /api/app/members/[id]` gives the same answer to a write, so the
// page and the route agree.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.screens.members} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { viewer, refusal } = await openScreen('members')
  if (refusal) return refusal

  const { id } = await params
  const member = await loadMember(id)
  if (!member || !member.isMoreskant) notFound()

  return (
    <AppShell viewer={viewer} screen="members" title={shownName(member)}>
      <Link className="app__back" href="/app/members">
        ‹ {APP_STRINGS.members.back}
      </Link>

      <p className="app__comp-intro">{APP_STRINGS.members.profileIntro}</p>

      <MemberProfileForm member={member} />
    </AppShell>
  )
}
