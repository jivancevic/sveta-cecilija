import { pluralize } from '@/lib/app/roster-loaders'
import { APP_STRINGS, KIND_LABELS, ROLE_LABELS, dayAndMonth, weekdayLabel } from '@/lib/app/strings'
import { MARK_OF_ROLE, type MyStanding, type RivalNews } from '@/lib/app/leaderboard-rank'
import type { DancerProfile } from '@/lib/app/dancer-season-data'
import type { ProfileRingPart } from '@/lib/app/profile-rings'
import type { MySeasonMonth } from '@/lib/app/my-season-loaders'
import { flameNiz } from '@/lib/app/niz'
import { Card, CountUp, Flame, List, ListRow, Ring, RoleMark, Section } from '../../ui'
import { StandingCard } from './StandingCard'

// One moreškant's season, and Moja sezona, which is this same screen with the
// reader in it (#608).
//
// **The only difference is one block.** A reader's own profile carries the
// standing sentence and the rank movement under the name; another dancer's
// starts at the rings. Everything else — the rings, the split, the record, the
// evenings, the chart — is identical, because those are facts about a person
// and the standing block is a message TO one. A nudge on somebody else's
// profile is a comment on their effort, which is the same rule that keeps the
// bottom of Ljestvica unmarked.
//
// **No mobile and no e-mail, ever**, on anybody's profile including the
// reader's own: those are the voditelj's and they stay on Članovi. The name is
// the deliberate exception (ADR-0019, amended here) — seventy people who all
// know each other, and "Cici" identifies nobody who has not met him. The
// projection that enforces it is `toDancerIdentity`, and
// `dancer-season-no-pii.test.ts` scans this file to keep it honest.
//
// **A vanredna names no venue and no client.** The register a dancer reads says
// "Vanredna" and stops; `place` arrives null for one, decided in the loader
// rather than hidden here, so a future caller cannot re-introduce it by drawing
// a field this screen happens not to print.

const S = APP_STRINGS.profile
const B = APP_STRINGS.board

const CHART = { width: 340, height: 124, top: 16, base: 100, gap: 6 }

/** The bars: the season's confirmed evenings in the sunk tone, theirs in gold. */
function MonthChart({ months }: { months: MySeasonMonth[] }) {
  const max = Math.max(1, ...months.map((m) => m.total))
  const slot = CHART.width / months.length
  const barWidth = Math.max(10, Math.min(34, slot - CHART.gap * 2))
  const scale = (value: number) => ((CHART.base - CHART.top) * value) / max

  return (
    <svg
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      role="img"
      aria-label={APP_STRINGS.mySeason.chartLabel}
      className="app__bars-svg"
    >
      {months.map((m, i) => {
        const x = i * slot + (slot - barWidth) / 2
        const total = scale(m.total)
        const mine = scale(m.mine)
        return (
          <g key={m.month}>
            {/* Tokens, not hexes: the night skin re-points `--sunk` and
                `--gold`, and a hex would stay on paper while the page moved. */}
            <rect
              x={x}
              y={CHART.base - total}
              width={barWidth}
              height={total}
              rx="3"
              fill="var(--sunk)"
            />
            {mine > 0 && (
              <rect
                x={x}
                y={CHART.base - mine}
                width={barWidth}
                height={mine}
                rx="3"
                fill="var(--gold)"
              />
            )}
            <text x={x + barWidth / 2} y={CHART.base - total - 4} textAnchor="middle" fontSize="11">
              {m.mine}/{m.total}
            </text>
            <text
              x={x + barWidth / 2}
              y={CHART.base + 14}
              textAnchor="middle"
              fontSize="11"
              className="app__bars-axis"
            >
              {m.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** The disc for one dance role: the army in colour, the title as a glyph. */
function Role({ role, small = false }: { role: keyof typeof MARK_OF_ROLE; small?: boolean }) {
  const spec = MARK_OF_ROLE[role]
  return <RoleMark army={spec.army} role={spec.role} small={small} />
}

/** What a list of this kind was worth to this dancer: a ring, a place, a split. */
export interface ProfileRing {
  kind: 'moreska' | 'experience'
  count: number
  of: number
  rank: number | null
  total: number
  /** The roles they wore in this list's evenings, in drawing order. */
  tallies: { role: keyof typeof MARK_OF_ROLE; count: number }[]
  /** Count up on first paint: the reader's own numbers, never somebody else's. */
  animate: boolean
  /** Whether this list is ranked at all this season (#614). */
  ranked: boolean
  /** Redovne and vanredne, for the Moreška ring's two companions (#634). */
  parts: ProfileRingPart[]
}

/** The roles a dancer wore in one list's evenings, as discs with counts. */
function Split({ tallies }: { tallies: ProfileRing['tallies'] }) {
  if (tallies.length === 0) return null
  return (
    <span className="app__pf-split">
      {tallies.map(({ role, count }) => (
        <span key={role} className="app__lb-tally">
          <Role role={role} small />
          <b>{count}</b>
        </span>
      ))}
    </span>
  )
}

/**
 * The season's main list: one ring, the size of the fact it carries (#614).
 *
 * Moreška has two dozen evenings in a season and the Experience has two, and
 * until now they were two rings of identical size side by side, which said they
 * were equally important. This one keeps the ring; the other one lost it.
 */
function RingCard({ ring }: { ring: ProfileRing }) {
  return (
    <Card className="app__pf-ring">
      <div className="app__pf-ring-main">
        <Ring
          value={ring.count}
          max={Math.max(1, ring.of)}
          size="card"
          label={
            <span className="app__pf-ring-in">
              <b>{ring.animate ? <CountUp value={ring.count} /> : ring.count}</b>
              <small>{S.ringOf(ring.of)}</small>
            </span>
          }
        />
        <div className="app__pf-ring-side">
          <span className="app__pf-ring-label">{B.lists[ring.kind]}</span>
          <span className="app__pf-place">
            {ring.rank === null ? S.placeNone : S.place(ring.rank, ring.total)}
          </span>
          <Split tallies={ring.tallies} />
        </div>
      </div>

      {/* The same season, split in two (#634). "17 od 32" does not say whether
          a dancer was at the redovne and missed the ship groups or the other
          way round, and that is the question a moreškant actually asks himself
          in September. Two smaller rings in the same shape, so they read as
          halves of the one above and not as two more facts.

          The word goes UNDER each ring rather than inside it: at 72px the hole
          holds a figure and "od 12", and a third line would be a smudge. */}
      {ring.parts.length > 0 && (
        <div className="app__pf-parts">
          {ring.parts.map((part) => (
            <div className="app__pf-part" key={part.key}>
              <Ring
                value={part.count}
                max={Math.max(1, part.of)}
                label={
                  <span className="app__pf-ring-in">
                    <b>{part.count}</b>
                    <small>{S.ringOf(part.of)}</small>
                  </span>
                }
              />
              <span className="app__pf-part-label">{S.partLabel[part.key]}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/**
 * The season's second list, as a line rather than a ring (#614, finding 11).
 *
 * A ring reading "0 od 2" is a dead circle: it says nothing, invites nothing
 * and takes the same space as the twenty-four-evening one above it. A count
 * says the same thing in a line, and an empty one says "još nijedan" — which is
 * a sentence rather than an empty shape. No place while the list is unranked,
 * because a third place among people who danced once is not a result.
 */
function CountCard({ ring }: { ring: ProfileRing }) {
  return (
    <Card className="app__pf-side">
      <div className="app__pf-side-top">
        <span className="app__pf-ring-label">{B.lists[ring.kind]}</span>
        <b className="app__pf-side-count">
          {ring.count === 0 ? S.sideNone : `${ring.count} ${S.ringOf(ring.of)}`}
        </b>
      </div>
      {ring.rank !== null && (
        <span className="app__pf-place">{S.place(ring.rank, ring.total)}</span>
      )}
      <Split tallies={ring.tallies} />
    </Card>
  )
}

export function DancerProfileView({
  profile,
  rings,
  mine,
  standing,
  movement,
  rival,
}: {
  profile: DancerProfile
  /** Both lists, always both, so a zero Experience reads as zero and not as absent. */
  rings: ProfileRing[]
  /** The reader is looking at themselves. */
  mine: boolean
  /** The standing card; only ever passed for the reader's own profile. */
  standing: MyStanding | null
  /** Places moved on the last confirmed evening; the reader's own only. */
  movement: number | null
  /** Who they went past on it, or who went past them; the reader's own only. */
  rival?: RivalNews | null
}) {
  const { identity, season, evenings, niz, nizRange } = profile
  // The main list is the one the screen is built around; the other is a line.
  const main = rings.find((r) => r.kind === 'moreska') ?? rings[0]
  const side = rings.filter((r) => r !== main)

  return (
    <>
      <div className="app__pf-id">
        <RoleMark army={identity.army} title={null} initials={identity.initials} />
        <div>
          <h2>{identity.name}</h2>
          {identity.nickname && <p>{identity.nickname}</p>}
        </div>
      </div>

      {/* The roles, each NAMED beside its disc (#614, finding 14). Five bare
          circles told nobody who has not memorised which colour is which army
          anything at all, and colour was carrying the whole meaning on its own.
          The block also has air around it now: it was wedged between the name
          above and the sentence below. */}
      <div className="app__pf-can">
        <span className="app__pf-can-label">{S.canDance}</span>
        {identity.roles.length === 0 ? (
          <span className="app__pf-can-none">{S.canDanceNone}</span>
        ) : (
          <span className="app__pf-can-roles">
            {identity.roles.map((role) => (
              <span key={role} className="app__pf-can-role">
                <Role role={role} small />
                {ROLE_LABELS[role]}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* The one block that is the reader's alone. Another dancer's profile has
          no empty slot where it would be: the rings simply start here. Since
          #614 it is the same card the board draws, so Moja sezona and Ljestvica
          cannot describe one standing two different ways. */}
      {mine && standing && (
        <StandingCard standing={standing} movement={movement} rival={rival} />
      )}

      <div className="app__pf-rings">
        {main && <RingCard ring={main} />}
        {side.map((ring) => (
          <CountCard key={ring.kind} ring={ring} />
        ))}
      </div>

      {/* The record as a LINE, not a card (#614, finding 10). Everything on
          this screen used to be a full-width surface of the same weight — the
          sentence, two rings, the record, its footnote — and when everything is
          lifted nothing is. The cards are now the two things a season is
          measured in; the record is a fact under them.

          Since #628 the record is the longest NIZ, and this is the one place
          in the app with room for the big flame: the number sits INSIDE the
          glyph here and beside it in a list row, which is the same decision
          Quizlet, Mimo and Numo all made at these two sizes. A dancer who has
          never been in a confirmed postava gets the line and no flame — a
          flame with a nought in it is not a record. */}
      <p className="app__pf-niz">
        {/* The same threshold the list applies (`flameNiz`), so a record of one
            or two is a line of words rather than a 46px flame with a "1" in
            it. Unlike the list, the profile draws it for a FINISHED record too:
            this is the one place a run that is over is still the fact on the
            screen, and "I još traje." under it is what separates the two. */}
        {flameNiz(niz.length) !== null && <Flame count={niz.length} large />}
        <span>{S.niz}</span>
        <b>{niz.length > 0 ? S.nizValue(niz.length) : S.nizNone}</b>
        {/* WHICH evenings it was (#634). A range and no verb: "ugasio se" reads
            as either the last evening of the run or the first one missed, and
            two dates cannot be read two ways. A run still going has one end,
            so it says "Traje od" and drops "I još traje." rather than saying
            the same thing twice on two lines. */}
        {nizRange &&
          (niz.running ? (
            <i>{S.nizSince(dayAndMonth(nizRange.from))}</i>
          ) : (
            <i>{S.nizRange(dayAndMonth(nizRange.from), dayAndMonth(nizRange.to))}</i>
          ))}
        {niz.running && !nizRange && <i>{S.nizCurrent}</i>}
      </p>

      <Section title={S.evenings} aside={pluralize(evenings.length, S.eveningsCount)} />
      {evenings.length === 0 ? (
        <p className="app__empty">{S.eveningsEmpty}</p>
      ) : (
        <List>
          {evenings.map((evening) => (
            <ListRow
              key={evening.performanceId}
              // Stanje, where the whole postava of that evening is: the profile
              // says what one person did and Stanje says who they did it with,
              // which closes the loop between the two screens.
              href={`/app/moreska/${evening.performanceId}`}
              lead={<Role role={evening.role} small />}
              // The DATE is the title, as it is on an Izvedbe detail (#567):
              // an evening is identified by when it was, and the kind is the
              // chip beside it.
              title={dayAndMonth(evening.date)}
              // A vanredna carries no venue, by the loader's decision: the
              // dancer's register names the kind of evening and never the client.
              meta={[weekdayLabel(evening.date), evening.place].filter(Boolean).join(' · ')}
              trail={<span className="app__pf-kind">{KIND_LABELS[evening.kind]}</span>}
            >
              <span className="app__sr-only">{ROLE_LABELS[evening.role]}</span>
            </ListRow>
          ))}
        </List>
      )}

      {season.byMonth.length > 0 && (
        <section className="app__lb-group">
          <Section title={APP_STRINGS.mySeason.byMonth} />
          <Card>
            <MonthChart months={season.byMonth} />
            <p className="app__bars-legend">
              {mine ? APP_STRINGS.mySeason.legend : S.legendOther}
            </p>
          </Card>
        </section>
      )}
    </>
  )
}
