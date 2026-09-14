import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadMember } from '@/lib/app/members-data'
import { armyOfRole, initialsOf, roleLabel, shownName } from '@/lib/app/members-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../../../AppShell'
import { openScreen } from '../../../gate'
import { Chip, RoleMark, Section } from '../../../ui'
import { InviteActions } from '../InviteActions'
import { MemberProfileForm } from './MemberProfileForm'

// `/app/members/[id]` — one dancer's profile (#511, in the redesign's skin
// since #573).
//
// The Backoffice's Members edit form has eleven fields, six of which a voditelj
// cannot see and two of which they cannot write. This is the six that are
// theirs, on a phone, with the name they may not change shown as a fact rather
// than as a disabled input.
//
// Three parts and always these three (Q37): the head says who this is (the
// army disc with their initials, the nickname, the real name under it), the
// quick actions are the two invitation channels — which moved here off the list
// row, because sending somebody their way in is something you do while looking
// at THAT person — and then the form, which ends in one Spremi.
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

const S = APP_STRINGS.members

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

  const shown = shownName(member)

  return (
    <AppShell viewer={viewer} screen="members" title={shown}>
      <Link className="app__back" href="/app/members">
        ‹ {S.back}
      </Link>

      <div className="app__cols">
        <div>
          <header className="app__member-head">
            <RoleMark army={armyOfRole(member.primaryRole)} initials={initialsOf(member.name)} />
            <div className="app__member-head-body">
              <b>{shown}</b>
              <span>{member.name === shown ? roleLabel(member.primaryRole) : member.name}</span>
            </div>
            {!member.active && <Chip>{S.retired}</Chip>}
          </header>

          <MemberProfileForm member={member} />
        </div>

        <div>
          <Section title={S.invite} />
          <InviteActions id={member.id} nickname={shown} mobile={member.mobile} />
        </div>
      </div>
    </AppShell>
  )
}
