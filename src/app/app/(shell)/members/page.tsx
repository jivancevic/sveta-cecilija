import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { getCurrentJoinCode, getPendingJoinClaims } from '@/lib/app/join-data'
import { formatDateTimeHr } from '@/lib/app/join'
import { loadRoster } from '@/lib/app/members-data'
import { toMemberListInput } from '@/lib/app/members-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { AddDancer } from './AddDancer'
import { Invitations } from './Invitations'
import { MembersList } from './MembersList'

// `/app/members` — Članovi (#511), the voditelj's roster screen.
//
// It absorbs Pozivnice, which was a Više row until now (#463), because the two
// were always one job seen from two sides: the list of dancers and the list of
// dancers who cannot get in yet are the same list. So the roster is the screen,
// and an invitation is something that happens ON a row.
//
// **The list is the screen** (#573, Q37): search, the three chips, a row per
// moreškant, the profile behind each row. The rehearsal half — the join code,
// the queue and the bulk invitation — is one tap away behind the header icon,
// because it is what a voditelj needs standing in a hall at the start of a
// season and the roster is what they need for the rest of it. The queue puts a
// count on that icon, so nobody waiting goes unseen.
//
// Voditelj only (`moreska`), and every route it posts to re-checks that itself:
// the screen is UX, never the boundary.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.screens.members} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default async function MembersPage() {
  const { viewer, refusal } = await openScreen('members')
  if (refusal) return refusal

  const [{ members, idsWithLogin }, joinCode, pending] = await Promise.all([
    loadRoster(),
    getCurrentJoinCode(),
    getPendingJoinClaims(),
  ])

  // The QR is a picture of a server fact, so the server draws it. `unoptimized`
  // on the <Image> side: a data URL has nothing for the optimizer to fetch.
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '')
  const joinUrl = joinCode && base ? `${base}/app/join/${joinCode.code}` : null
  const qr = joinUrl ? await QRCode.toDataURL(joinUrl, { margin: 1, width: 440 }) : null

  // The bulk invitation's audience, counted here rather than in the browser:
  // the sheet only needs to know whether there is anybody left to invite.
  const missingLogins = members.filter((m) => m.active && !idsWithLogin.has(m.id)).length

  return (
    <AppShell
      viewer={viewer}
      screen="members"
      actions={
        <Invitations
          code={joinCode?.code ?? null}
          validUntil={joinCode ? formatDateTimeHr(joinCode.expiresAt) : null}
          url={joinUrl}
          qr={qr}
          claims={pending}
          missingLogins={missingLogins}
        />
      }
    >
      <div className="app__col">
        {/* The e-mail comes off here, not in the component: `MembersList` is a
            client component, so every field it is handed ships in the HTML, and
            ADR-0024 lets a mobile cross into `/app` and not an address. */}
        <MembersList
          members={members.map(toMemberListInput)}
          memberIdsWithLogin={[...idsWithLogin]}
        />

        <AddDancer />
      </div>
    </AppShell>
  )
}
