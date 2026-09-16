import { notFound } from 'next/navigation'
import { getPerformanceDetail } from '@/lib/app/detail-data'
import { stanjeView } from '@/lib/app/stanje-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { Chip, KindChip, Note } from '../../../ui'
import { AppShell } from '../../../AppShell'
import { openScreen } from '../../../gate'
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
      <p className="app__stanje-when">
        <span>{view.headDate}</span>
        {/* The kind as a chip since #592, in the tone its disc wears on Moreška
            below: one colour language across the two screens. */}
        <KindChip tone={view.tone}>{view.kind}</KindChip>
      </p>
      {view.meta && <p className="app__stanje-where">{view.meta}</p>}
      {(view.cancelled || view.confirmed) && (
        <div className="app__chips">
          {view.cancelled && <Chip tone="warn">{S.cancelled}</Chip>}
          {/* A confirmed postava is public to the whole roster: the chip is how
              a dancer knows the crowns below are final (story 33). */}
          {view.confirmed && <Chip tone="gold">{S.lineupConfirmed}</Chip>}
        </div>
      )}
      {/* "Potvrdio: Ante Bačić · 20. kolovoza" (#658). A postava can be locked
          by more than one hand now, and "whose" is the first question asked the
          first time a season statistic looks wrong. */}
      {view.confirmedBy && <p className="app__stanje-where">{view.confirmedBy}</p>}
      {/* "Popis vodi: …", and ONLY when it is somebody other than a voditelj
          (#658). A voditelj keeps every list without being written down,
          so no line means the voditelji are running the night, as always. It
          answers "koga pitam"; the line above answers "tko je ovo zaključao",
          which is a different question and therefore a different line. */}
      {view.keptBy && <p className="app__stanje-where">{view.keptBy}</p>}
    </header>
  )

  return (
    <AppShell
      viewer={viewer}
      screen="moreska"
      title={S.title}
      intro={intro}
      back={{ href: '/app/moreska', label: S.back }}
    >
      {view.note && <Note>{view.note}</Note>}
      <Stanje
        view={view}
        // `moreska` — the alarm and naming a Zaduženi, and nothing else since
        // #658. Whether the reader may RUN this evening is `view.keepsList`.
        voditelj={voditelj}
        lineup={detail.lineup}
        // The alarm is only ever about an evening still ahead (#430, story 20).
        // The route refuses the other two cases anyway, so this only keeps the
        // sheet from offering what the server would decline.
        canAlarm={detail.canAlarm}
      />
    </AppShell>
  )
}
