import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Bell } from 'lucide-react'
import { loadHomeScreen } from '@/lib/app/home-data'
import type { HomeCard } from '@/lib/app/home-screen'
import { ONBOARDING_COOKIE, needsOnboarding } from '@/lib/app/onboarding'
import { APP_STRINGS } from '@/lib/app/strings'
import { resolveAppViewer } from '@/lib/app/viewer'
import { Card, Chip, Hero, List, ListRow, Podium, Ring, Tile, Tiles } from '../ui'
import { AppShell } from '../AppShell'
import { deniedFor } from '../DeniedPage'
import { Answer } from './moreska/Answer'
import { StateBar } from './moreska/StateBar'
import { HeroHalves } from '../HeroHalves'

// `/app` — Početna, the front door (#564, decisions Q16, Q26, Q59, Q61).
//
// It used to be a redirect: `/app` computed the reader's first tab and forwarded
// to it. That was right while the bar was the whole of the navigation, and wrong
// as soon as the bar became three chosen screens (#563) — the first tab is a
// job, and the app opened on a job before it had said hello.
//
// So it is a screen now, and the only one in Cecilija that is not about a job:
// the logo and the wordmark (this screen and no other names the app), the
// greeting, one sentence about the next evening, and then one card per tab in
// the reader's own order plus Obavijesti. **Four cards at most** (Q26): the
// point of a landing screen is that it can be read in a glance, and a fifth
// card is how it becomes a dashboard.
//
// **A card whose screen the account does not unlock is never built**, and that
// is not a check this file makes: the cards come off `nav.tabs`, which is the
// permission table's own answer (`lib/app/screens.ts`). There is no second list
// of who-may-see-what here to drift from the first.
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
  const inbox = home.cards.find((card) => card.kind === 'inbox') ?? null
  const tiles = home.cards.filter((card) => card.kind !== 'inbox')

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
          eyebrow={home.moreska.hero.eyebrow}
          day={home.moreska.hero.day}
          month={home.moreska.hero.month}
          meta={home.moreska.hero.meta}
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

      {tiles.length > 0 && <Tiles>{tiles.map(renderTile)}</Tiles>}

      {inbox && inbox.kind === 'inbox' && <Inbox card={inbox} />}
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
        <Podium entries={card.entries} />
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
 * The Obavijesti card: the last thing that happened, and how many are unread.
 *
 * Full width and last, as the prototype has it, because it is news rather than
 * a figure: it is the only card whose content is a sentence somebody wrote.
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
