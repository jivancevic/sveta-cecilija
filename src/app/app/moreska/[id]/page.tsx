import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPerformanceDetail } from '@/lib/app/detail-data'
import { stanjeView } from '@/lib/app/stanje-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { Chip, Note } from '../../ui'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { Stanje } from './Stanje'

// `/app/moreska/[id]` — Stanje, one nastup on one screen (#566).
//
// The screen a voditelj holds in their hand at seven in the evening, and the
// one a dancer opens to see whether there are enough of them. Everything about
// an evening that concerns the DANCE is here and nothing that concerns the
// ticket shop: no seats, no revenue, no buyer (Q29). The blagajna's half of the
// same evening is a different screen, `/app/performances/[id]`, and since this
// one exists a `moreskant` login does not unlock that one at all.
//
// Gated on `moreska`, the screen key, which `moreskant` and `moreska` both
// unlock — so the gate is the table's and not a second opinion about who may
// read a headcount (ADR-0024: visibility inside the roster is society-wide).
//
// What it SAYS is `lib/app/stanje-screen.ts`, pure and tested without a
// database; what it can DO is `Stanje.tsx`, the one client island. The page
// itself loads through the seam and draws the header.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.stanje

export default async function StanjePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { viewer, refusal } = await openScreen('moreska')
  if (refusal) return refusal

  const me = viewer.me
  const voditelj = viewer.voditelj
  const detail = await getPerformanceDetail(id, { memberId: me?.id ?? null, voditelj })
  if (!detail) notFound()

  const view = stanjeView(detail)

  const intro = (
    <header className="app__stanje-head">
      <Link className="app__back" href="/app/moreska">
        ‹ {S.back}
      </Link>
      <p className="app__stanje-when">{view.head}</p>
      {view.meta && <p className="app__stanje-where">{view.meta}</p>}
      {(view.cancelled || view.confirmed) && (
        <div className="app__chips">
          {view.cancelled && <Chip tone="warn">{S.cancelled}</Chip>}
          {/* A confirmed postava is public to the whole roster: the chip is how
              a dancer knows the crowns below are final (story 33). */}
          {view.confirmed && <Chip tone="gold">{S.lineupConfirmed}</Chip>}
        </div>
      )}
    </header>
  )

  return (
    <AppShell viewer={viewer} screen="moreska" title={S.title} intro={intro}>
      {view.note && <Note>{view.note}</Note>}
      <Stanje
        view={view}
        voditelj={voditelj}
        // The alarm is only ever about an evening still ahead (#430, story 20).
        // The route refuses the other two cases anyway, so this only keeps the
        // sheet from offering what the server would decline.
        canAlarm={detail.canAlarm}
      />
    </AppShell>
  )
}
