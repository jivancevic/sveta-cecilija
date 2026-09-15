import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Bell } from 'lucide-react'
import { loadHomeCard, loadHomeScreen } from '@/lib/app/home-data'
import type { HomeCard, HomeCardKey } from '@/lib/app/home-screen'
import { ONBOARDING_COOKIE, needsOnboarding } from '@/lib/app/onboarding'
import { screenByKey } from '@/lib/app/screens'
import { APP_STRINGS } from '@/lib/app/strings'
import { resolveAppViewer, type AppViewer } from '@/lib/app/viewer'
import { Card, Chip, Hero, List, ListRow, Podium, Ring, Tile, Tiles, Trophy } from '../ui'
import { AppShell } from '../AppShell'
import { deniedFor } from '../DeniedPage'
import { InstallNudge } from '../InstallNudge'
import { Answer } from './moreska/Answer'
import { StateBar } from './moreska/StateBar'
import { HeroHalves } from '../HeroHalves'
import { HeroMeta } from '../HeroMeta'
import { HeroEyebrow } from '../HeroEyebrow'

// `/app` — Početna, the front door (#564, decisions Q16, Q26, Q59, Q61).
//
// It used to be a redirect: `/app` computed the reader's first tab and forwarded
// to it. That was right while the bar was the whole of the navigation, and wrong
// as soon as the bar became three chosen screens (#563) — the first tab is a
// job, and the app opened on a job before it had said hello.
//
// So it is a screen now, and the only one in Cecilija that is not about a job:
// the logo and the wordmark (this screen and no other names the app), the
// greeting, one sentence about the next evening, and then one card per screen
// the reader UNLOCKS.
//
// **Two weights rather than a cap** (#627, Q23-Q26). It was four cards at most
// until this ticket, because the point of a landing screen is that it can be
// read in a glance. That is still true of a flat list of thirteen, so the list
// is not flat: the three tabs keep their hero, their rings and their large
// figures, and the rest are short two-up tiles carrying a name and a number.
//
// **The second half is streamed** (Q23). Obavijesti and every short tile sits
// in its own `<Suspense>` boundary and loads itself, so the top of the screen
// paints on the tab screens' queries alone and one slow loader delays only its
// own tile. This is the FIRST Suspense boundary in Cecilija; the pattern and
// its rules are written up in `docs/agents/moreskant-app.md`.
//
// **A card whose screen the account does not unlock is never built**, and that
// is not a check this file makes: the cards come off `homeCardPlan`, which
// reads the nav, which is the permission table's own answer
// (`lib/app/screens.ts`). There is no second list of who-may-see-what here to
// drift from the first.
//
// No money except the Financije card's one figure, and no buyer name or address
// anywhere: Početna is read by every account that is in, the shared `tehnika`
// and `member` logins included.
//
// Everything is server-rendered except the two things a browser has to own: the
// attendance answer on the Moreška hero and that hero's tap into Stanje. Both
// are **Moreška's own components** (#565), not copies — one evening described
// by two modules is how two screens come to disagree about it.
//
// `home-data.ts` loads only the cards this reader is getting, and
// `home-screen.ts` decides what each of them says.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.landing

export default async function AppHomePage() {
  const viewer = await resolveAppViewer()

  // Decided out of the viewer itself and BEFORE the two early exits, so every
  // input the rule reads is the real one (#457 review): the signed-out and the
  // denied cases are the rule's to answer, not this file's to pre-empt.
  const jar = await cookies()
  const welcome = needsOnboarding({
    signedIn: viewer.signedIn,
    denied: viewer.access.kind === 'denied',
    hasMember: viewer.me != null,
    cookiePresent: jar.has(ONBOARDING_COOKIE),
  })

  if (!viewer.signedIn) redirect('/app/login')
  if (viewer.access.kind === 'denied') return deniedFor(viewer)
  // The Dobrodošlica is sent from HERE and from nowhere else (#457): every other
  // page under `/app` opens on what it says it is, so a push deep-link into
  // tonight's postava can never land on a walkthrough.
  if (welcome) redirect('/app/welcome')

  const home = await loadHomeScreen(viewer)
  const hasInbox = home.secondary.includes('notifications')
  const rest = home.secondary.filter((key) => key !== 'notifications')

  return (
    <AppShell viewer={viewer} screen="home" brand>
      {(home.greeting || home.sentence) && (
        <p className="app__home-greet">
          {home.greeting && <b>{home.greeting}</b>}
          {home.sentence && <span>{home.sentence}</span>}
        </p>
      )}

      {/* The one hero, when the reader's bar carries Moreška: the next nastup,
          the answer in it, and the two armies under it. There is never a
          second hero on a screen (T1), which is why every other card is a tile. */}
      {home.moreska && (
        <Hero
          // The card itself opens the Moreška TAB, not this evening's Stanje
          // (#620): a dancer tapping the widget wants their own register, and
          // the evening is already one tap away on the bar under it and on the
          // head of each half on a split day.
          href="/app/moreska"
          hrefLabel={APP_STRINGS.landing.open.moreska}
          eyebrow={
            <HeroEyebrow
              text={home.moreska.hero.eyebrow}
              today={home.moreska.hero.todayLabel}
            />
          }
          className={home.moreska.hero.todayLabel ? 'app__hero--today' : undefined}
          {...(home.moreska.hero.halves
            ? // A split day says the date once, in the eyebrow: the big serif
              // date and the weekday line belong to the single hero (#592).
              {}
            : {
                day: home.moreska.hero.day,
                month: home.moreska.hero.month,
                meta: (
                  <HeroMeta
                    lead={home.moreska.hero.metaLead}
                    kind={home.moreska.hero.kind}
                    tone={home.moreska.hero.tone}
                  />
                ),
              })}
        >
          {home.moreska.hero.halves ? (
            <HeroHalves
              halves={home.moreska.hero.halves}
              moreLabel={home.moreska.hero.moreLabel}
              memberId={home.moreska.memberId}
            />
          ) : (
            <>
              {home.moreska.memberId && (
                <Answer
                  performanceId={home.moreska.performanceId}
                  memberId={home.moreska.memberId}
                  current={home.moreska.answer}
                  disabled={!home.moreska.canAnswer}
                  lockNote={home.moreska.canAnswer ? null : APP_STRINGS.answer.locked}
                />
              )}
              {home.moreska.hero.armies && (
                <StateBar
                  crni={home.moreska.hero.armies.crni}
                  bili={home.moreska.hero.armies.bili}
                  threshold={home.moreska.hero.armies.threshold}
                  href={home.moreska.hero.href}
                />
              )}
            </>
          )}
        </Hero>
      )}

      {/* The install offer (#616), under the reader's job and above the rest.
          It renders nothing at all on a phone that already runs the app from
          its home screen, and it decides that from the browser rather than from
          a flag, so it can never be wrong about it. Placed here and on no other
          screen: Početna is the front door, and an offer on top of a screen
          somebody opened to do something is noise. */}
      <InstallNudge />

      {home.cards.length > 0 && <Tiles>{home.cards.map(renderTile)}</Tiles>}

      {/* The second half, and every piece of it streams (#627). Each boundary
          wraps ONE card's load, so the tile appears when its own screen's
          loader answers and not when the slowest one does. A pending tile holds
          the height it will have when it is filled and shows a muted rule —
          never a zero, which a reader would take for a figure. */}
      {hasInbox && (
        <Suspense fallback={<InboxWaiting />}>
          <InboxCard viewer={viewer} />
        </Suspense>
      )}

      {rest.length > 0 && (
        <Tiles className="app__home-rest">
          {rest.map((key) => (
            <Suspense key={key} fallback={<TileWaiting cardKey={key} />}>
              <RestTile viewer={viewer} cardKey={key} />
            </Suspense>
          ))}
        </Tiles>
      )}
    </AppShell>
  )
}

/**
 * One tile: the figure, the ring or the podium, and the whole card is the way
 * in.
 *
 * The tile IS the action, which is why there is no button inside it — a card
 * with one link and one button in it asks the reader which of the two to press
 * when both go to the same place. The action's words are the tile's accessible
 * name instead ("Otvori Narudžbe"), so a screen reader hears the verb a sighted
 * reader infers from the eyebrow.
 */
function renderTile(card: HomeCard) {
  if (card.kind === 'inbox') return null

  if (card.kind === 'ring') {
    return (
      <Tile
        key={card.key}
        href={card.href}
        aria-label={card.action}
        eyebrow={card.eyebrow}
        caption={card.caption}
      >
        {card.ring && <Ring value={card.ring.value} max={card.ring.max} />}
      </Tile>
    )
  }

  if (card.kind === 'podium') {
    return (
      <Tile
        key={card.key}
        href={card.href}
        aria-label={card.action}
        eyebrow={card.eyebrow}
        caption={card.caption}
      >
        {/* The glance, dressed the way the screen it previews is (#612): a cup
            over the winner's step, so the tallest bar is read as FIRST rather
            than merely tall, and the reader's own step outlined if they are on
            it. The cup is the winner's alone — Ljestvica draws all three,
            because there a tie is a thing the cups have to explain; a tile has
            no room to explain anything and one cup is the whole sentence.

            `large` stays off: it would also switch on the marks and the "1.
            mjesto" captions, which are text this card is half a phone too
            narrow for. */}
        <Podium
          entries={card.entries.map((entry, index) => ({
            label: entry.label,
            value: entry.value,
            me: entry.me,
            // A CUP here and the blades on Ljestvica itself (#627, Q1): this
            // tile's job is to lead to that screen, and the cup is the mark the
            // Ljestvica tab already wears.
            cup:
              index === 0 ? (
                <Trophy place={1} small shape="cup" className="ui-podium__cup" />
              ) : undefined,
          }))}
        />
      </Tile>
    )
  }

  return (
    <Tile
      key={card.key}
      href={card.href}
      aria-label={card.action}
      eyebrow={card.eyebrow}
      caption={card.caption}
    >
      {card.figure != null && (
        <b className={`app__home-figure${figureSize(card.figure)}`}>{card.figure}</b>
      )}
      {card.chip && <Chip tone={card.chip.tone}>{card.chip.label}</Chip>}
    </Tile>
  )
}

/**
 * How big a figure may be drawn.
 *
 * Two digits is the usual case and gets the full 44px. Financije's figure is a
 * formatted amount ("7.350,00 €") and a tile is half a phone wide, so the type
 * steps down by length: a number that wrapped or ran off its card would be
 * worse than a smaller one.
 */
function figureSize(figure: string): string {
  if (figure.length <= 3) return ''
  return figure.length <= 6 ? ' app__home-figure--md' : ' app__home-figure--sm'
}

/**
 * The eyebrow of a screen that has not answered yet.
 *
 * The NAME is known without loading anything — it is in the screen table — so a
 * pending tile is never a blank box: it says which screen is coming and shows a
 * muted rule where its figure will be. A zero would be read as a figure, and a
 * spinner would be four spinners spinning at different speeds.
 */
function TileWaiting({ cardKey }: { cardKey: HomeCardKey }) {
  const label = cardKey === 'notifications' ? S.notifications : screenByKey(cardKey).label
  return (
    <div className="ui-tile ui-tile--sm app__home-wait" aria-hidden="true">
      <div className="ui-card__eyebrow">{label}</div>
      <span className="app__home-wait-rule" />
    </div>
  )
}

function InboxWaiting() {
  return (
    <Card className="app__home-wait" aria-hidden="true">
      <div className="ui-card__eyebrow">{S.notifications}</div>
      <span className="app__home-wait-rule" />
    </Card>
  )
}

/**
 * One short tile of the second half, loading itself.
 *
 * The name and one number, and nothing else: the caption, the ring and the
 * podium belong to the three cards at the top. A card with no number of its own
 * (Obračun, Gratis, Ljestvica) prints its sentence instead, so no tile is ever
 * just a name.
 */
async function RestTile({ viewer, cardKey }: { viewer: AppViewer; cardKey: HomeCardKey }) {
  const card = await loadHomeCard(viewer, cardKey)
  if (!card || card.kind === 'inbox') return null
  const figure = shortFigure(card)
  return (
    <Tile
      href={card.href}
      aria-label={card.action}
      eyebrow={card.eyebrow}
      className="ui-tile--sm"
      caption={figure === null ? card.caption : undefined}
    >
      {figure !== null && (
        <b className={`app__home-figure${figureSize(figure)}`}>{figure}</b>
      )}
    </Tile>
  )
}

/** The one number a short tile draws, or null when the card has none. */
function shortFigure(card: HomeCard): string | null {
  if (card.kind === 'figure') return card.figure
  if (card.kind === 'ring') return card.ring ? String(card.ring.value) : null
  return null
}

async function InboxCard({ viewer }: { viewer: AppViewer }) {
  const card = await loadHomeCard(viewer, 'notifications')
  return card && card.kind === 'inbox' ? <Inbox card={card} /> : null
}

/**
 * The Obavijesti card: the last thing that happened, and how many are unread.
 *
 * Full width and first of the second half, because it is news rather than a
 * figure: it is the only card whose content is a sentence somebody wrote.
 */
function Inbox({ card }: { card: Extract<HomeCard, { kind: 'inbox' }> }) {
  if (!card.title) {
    return (
      <Card>
        <div className="ui-card__eyebrow">{card.eyebrow}</div>
        <p className="ui-small">{S.notificationsEmpty}</p>
      </Card>
    )
  }

  return (
    <List>
      <ListRow
        href={card.href}
        aria-label={card.action}
        lead={
          <span className="app__home-ico" aria-hidden="true">
            <Bell size={22} strokeWidth={1.75} />
          </span>
        }
        title={card.title}
        meta={card.body}
        trail={
          card.unread > 0 ? <Chip tone="gold">{S.notificationsNew(card.unread)}</Chip> : null
        }
      />
    </List>
  )
}
