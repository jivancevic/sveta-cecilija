'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import type { Permission } from '@/lib/access/permissions'
import './prototype.css'

// PROTOTYPE (#472): three variants of Cecilija's navigation for people who
// hold several permissions. Nothing here talks to Payload; every "user" is a
// hard-coded persona and every screen is a stub with fake rows, so what is
// being judged is the CHROME: which tabs, in what order, where Skener lives,
// what the landing screen is, and what the laptop sidebar does with the same
// permission set.

// ── Personas ────────────────────────────────────────────────────────────────

type PersonaKey = 'luka' | 'tatjana' | 'partner' | 'josip'

interface Persona {
  key: PersonaKey
  name: string
  who: string
  permissions: Permission[]
}

const PERSONAS: Persona[] = [
  { key: 'luka', name: 'Luka', who: 'moreškant koji ponekad skenira', permissions: ['moreskant', 'door'] },
  {
    key: 'tatjana',
    name: 'Tatjana',
    who: 'tajnica: narudžbe, izvedbe, upiti, vrata',
    permissions: ['tickets', 'refunds', 'door'],
  },
  { key: 'partner', name: 'Recepcija', who: 'partner: prodaje i vidi samo svoje', permissions: ['partner'] },
  {
    key: 'josip',
    name: 'Josip',
    who: 'sve ovlasti',
    permissions: ['users', 'tickets', 'refunds', 'door', 'partner', 'season_stats', 'moreska', 'moreskant', 'dev'],
  },
]

// ── Screens ─────────────────────────────────────────────────────────────────

type ScreenKey =
  | 'home'
  | 'performances'
  | 'mine'
  | 'scan'
  | 'doorlist'
  | 'orders'
  | 'sell'
  | 'statement'
  | 'inquiries'
  | 'comp'
  | 'users'
  | 'stats'
  | 'more'

type Workspace = 'moreskant' | 'box' | 'door' | 'partner' | 'admin'

interface Screen {
  key: ScreenKey
  label: string
  /** Unlocked by ANY of these. */
  any: Permission[]
  ws: Workspace
  /** Variant A's global rank: lower shows first, the first four are tabs. */
  rank: number
}

// The v1 screen list from the map, in Croatian, with the permission that
// unlocks each. Refunds are an action inside Narudžbe, not a screen; the
// lineup editor is inside an Izvedba; the dancer's Ljestvica is under Više.
const SCREENS: Screen[] = [
  { key: 'orders', label: 'Narudžbe', any: ['tickets'], ws: 'box', rank: 1 },
  { key: 'performances', label: 'Izvedbe', any: ['tickets', 'moreska', 'moreskant'], ws: 'moreskant', rank: 2 },
  { key: 'mine', label: 'Moje', any: ['moreskant'], ws: 'moreskant', rank: 3 },
  { key: 'scan', label: 'Skener', any: ['door'], ws: 'door', rank: 4 },
  { key: 'sell', label: 'Prodaja', any: ['partner'], ws: 'partner', rank: 5 },
  { key: 'statement', label: 'Obračun', any: ['partner'], ws: 'partner', rank: 6 },
  { key: 'inquiries', label: 'Upiti', any: ['tickets'], ws: 'box', rank: 7 },
  { key: 'comp', label: 'Gratis i kodovi', any: ['tickets'], ws: 'box', rank: 8 },
  { key: 'doorlist', label: 'Na vratima', any: ['door'], ws: 'door', rank: 9 },
  { key: 'users', label: 'Korisnici', any: ['users'], ws: 'admin', rank: 10 },
  { key: 'stats', label: 'Statistika', any: ['season_stats', 'tickets', 'moreska'], ws: 'admin', rank: 11 },
]

const SCREEN_BY_KEY = Object.fromEntries(SCREENS.map((s) => [s.key, s])) as Record<ScreenKey, Screen>

const WS_LABEL: Record<Workspace, string> = {
  moreskant: 'Moreškant',
  box: 'Blagajna',
  door: 'Vrata',
  partner: 'Partner',
  admin: 'Uprava',
}
const WS_ORDER: Workspace[] = ['moreskant', 'box', 'partner', 'door', 'admin']

function unlocked(p: Persona): Screen[] {
  return SCREENS.filter((s) => s.any.some((perm) => p.permissions.includes(perm))).sort(
    (a, b) => a.rank - b.rank,
  )
}

// ── Variants: the same permission set, three information architectures ──────

type VariantKey = 'A' | 'B' | 'C'

interface WorkspaceNav {
  ws: Workspace
  tabs: ScreenKey[]
  overflow: ScreenKey[]
}

interface Nav {
  /** Bottom bar entries, in order. */
  tabs: ScreenKey[]
  /** What Više lists beyond the standing rows (Postavke, Odjava...). */
  overflow: ScreenKey[]
  landing: ScreenKey
  /** One sentence for the state panel: where Skener lives for this person. */
  scanLives: string
  /** Variant C only. */
  workspaces?: WorkspaceNav[]
}

const MAX_TABS_A = 4

function navA(p: Persona): Nav {
  const all = unlocked(p).map((s) => s.key)
  const tabs = all.slice(0, MAX_TABS_A)
  const overflow = all.slice(MAX_TABS_A)
  const hasScan = all.includes('scan')
  return {
    tabs: [...tabs, 'more'],
    overflow,
    landing: tabs[0],
    scanLives: !hasScan ? 'nema ovlast' : tabs.includes('scan') ? 'tab u traci' : 'u Više (nije stao u četiri)',
  }
}

function navB(p: Persona): Nav {
  const all = unlocked(p).map((s) => s.key)
  const primaries: ScreenKey[] = all.filter((k) => k !== 'scan' && k !== 'doorlist').slice(0, 2)
  const overflow = all.filter((k) => !primaries.includes(k))
  return {
    tabs: ['home', ...primaries, 'more'],
    overflow,
    landing: 'home',
    scanLives: all.includes('scan')
      ? 'velika akcija na Početnoj na dan izvedbe, otvara skener preko cijelog ekrana'
      : 'nema ovlast',
  }
}

function navC(p: Persona): Nav {
  const all = unlocked(p)
  const workspaces: WorkspaceNav[] = WS_ORDER.filter((ws) => all.some((s) => s.ws === ws)).map((ws) => {
    const keys = all.filter((s) => s.ws === ws).map((s) => s.key)
    // A `tickets` holder sees Izvedbe in Blagajna too: same URL, one screen,
    // content decided by permissions.
    const inWs = ws === 'box' && p.permissions.includes('tickets') ? [...keys, 'performances' as ScreenKey] : keys
    const uniq = Array.from(new Set(inWs))
    return { ws, tabs: uniq.slice(0, 3), overflow: uniq.slice(3) }
  })
  const first = workspaces[0]
  return {
    tabs: [...first.tabs, 'more'],
    overflow: first.overflow,
    landing: first.tabs[0],
    scanLives: all.some((s) => s.key === 'scan')
      ? workspaces.length > 1
        ? 'vlastiti radni prostor Vrata, prebacuje se u zaglavlju'
        : 'jedini radni prostor'
      : 'nema ovlast',
    workspaces,
  }
}

const VARIANTS: Record<VariantKey, { name: string; blurb: string; build: (p: Persona) => Nav }> = {
  A: {
    name: 'Traka',
    blurb: 'Jedna ravna traka: sve što smiješ, po fiksnom redu, najviše četiri taba + Više. Kao Shopify.',
    build: navA,
  },
  B: {
    name: 'Početna',
    blurb: 'Početna kao osobna ploča + dva glavna taba + Više kao mreža. Skener je akcija, ne tab. Kao Square.',
    build: navB,
  },
  C: {
    name: 'Radni prostori',
    blurb:
      'Ovlasti se grupiraju u radne prostore (Moreškant, Blagajna, Vrata...), svaki sa svojom trakom. Kao Linear.',
    build: navC,
  },
}

// ── Icons (inline glyphs, no sprite) ────────────────────────────────────────

const ICONS: Record<ScreenKey, React.ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  performances: (
    <>
      <rect x="3" y="5" width="18" height="16" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  mine: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
      <path d="M7 12h10" />
    </>
  ),
  doorlist: <path d="M5 6h14M5 12h14M5 18h9" />,
  orders: (
    <>
      <path d="M4 7h16l-1.5 12h-13z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </>
  ),
  sell: (
    <>
      <rect x="3" y="7" width="18" height="11" />
      <path d="M3 11h18M8 7V5h8v2" />
    </>
  ),
  statement: <path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4" />,
  inquiries: <path d="M4 5h16v11H9l-5 4z" />,
  comp: (
    <>
      <path d="M4 9a2 2 0 0 0 0 6v3h16v-3a2 2 0 0 0 0-6V6H4z" />
      <path d="M12 6v12" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M15 20c0-2.5 1-4 3-4.5 1.7 0 3 1.7 3 4.5" />
    </>
  ),
  stats: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
}

function Icon({ k }: { k: ScreenKey }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONS[k]}
    </svg>
  )
}

function label(k: ScreenKey): string {
  if (k === 'home') return 'Početna'
  if (k === 'more') return 'Više'
  return SCREEN_BY_KEY[k].label
}

// ── Screen stubs ────────────────────────────────────────────────────────────

const TONIGHT = { title: 'Moreška', date: 'čet 17. 9.', time: '21:00', venue: 'Ljetno kino', sold: 212, cap: 350 }

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="proto__rows">
      {rows.map(([a, b]) => (
        <div key={a + b} className="proto__row">
          <span>{a}</span>
          <span className="proto__row-sub">{b}</span>
        </div>
      ))}
    </div>
  )
}

function StubBody({ k, persona }: { k: ScreenKey; persona: Persona }) {
  const has = (p: Permission) => persona.permissions.includes(p)
  switch (k) {
    case 'performances':
      return (
        <>
          <div className="app__hero">
            <p className="app__hero-eyebrow">
              <span>Sljedeća izvedba</span>
              <span>za 5 dana</span>
            </p>
            <p className="proto__hero-title">
              {TONIGHT.title} · {TONIGHT.date}
            </p>
            <p className="proto__muted">
              {TONIGHT.time} · {TONIGHT.venue}
              {has('tickets') && ` · ${TONIGHT.sold}/${TONIGHT.cap} prodano`}
            </p>
            {has('moreskant') && (
              <div className="proto__two">
                <button className="app__button">Dolazim</button>
                <button className="app__button proto__button--ghost">Ne mogu</button>
              </div>
            )}
            {has('tickets') && !has('moreskant') && (
              <div className="proto__two">
                <button className="app__button proto__button--ghost">Uredi</button>
                <button className="app__button proto__button--ghost">Prodaja na vratima</button>
              </div>
            )}
          </div>
          <p className="proto__note">
            Jedne Izvedbe za sve: moreškant vidi odgovor i postavu, blagajna prodaju i uređivanje, oboje na
            istoj adresi.
          </p>
          <Rows
            rows={[
              ['sub 19. 9. · Moreška', '21:00 · Ljetno kino'],
              ['čet 24. 9. · Moreška', '21:00 · Ljetno kino'],
              ['sub 3. 10. · Nastup za brod', '19:30 · Luka (nije javna)'],
            ]}
          />
        </>
      )
    case 'mine':
      return (
        <Rows
          rows={[
            ['Ovu sezonu', '14 izvedbi, 11 u postavi'],
            ['Ljestvica', '3. mjesto'],
            ['Bilješka', 'kraljev crni plašt kod Ive'],
          ]}
        />
      )
    case 'scan':
      return (
        <>
          <div className="proto__camera">kamera</div>
          <input className="app__input" placeholder="ili upiši kod s ulaznice" readOnly />
          <p className="proto__muted">
            Večeras: {TONIGHT.title} {TONIGHT.time} · ušlo 0 / {TONIGHT.sold}
          </p>
        </>
      )
    case 'doorlist':
      return (
        <Rows
          rows={[
            ['Ušlo', '87 od 212'],
            ['Prodano na vratima', '6 odraslih, 2 djece'],
            ['Zadnji sken', '20:58 · A. Marić'],
          ]}
        />
      )
    case 'orders':
      return (
        <>
          <input className="app__input" placeholder="Traži po imenu, e-mailu, kodu" readOnly />
          <Rows
            rows={[
              ['Ana Marić · 2 odrasla', 'čet 17. 9. · 40,00 € · online'],
              ['Hotel Korsal · 6 odraslih', 'čet 17. 9. · partner'],
              ['Marko K. · gratis 2', 'sub 19. 9. · član: Cici'],
            ]}
          />
        </>
      )
    case 'sell':
      return (
        <>
          <p className="proto__muted">
            Prodaj za: {TONIGHT.title} · {TONIGHT.date} · još 138 mjesta
          </p>
          <div className="proto__two">
            <button className="app__button">Odrasli 20 €</button>
            <button className="app__button proto__button--ghost">Dijete 10 €</button>
          </div>
        </>
      )
    case 'statement':
      return (
        <Rows
          rows={[
            ['Rujan 2026', '24 ulaznice · 460,00 €'],
            ['Kolovoz 2026', '61 ulaznica · 1.180,00 €'],
          ]}
        />
      )
    case 'inquiries':
      return (
        <Rows
          rows={[
            ['Privatna moreška, 30. 9.', 'nova · agencija iz Splita'],
            ['Doživljaj moreške', 'odgovoreno'],
          ]}
        />
      )
    case 'comp':
      return (
        <Rows
          rows={[
            ['Izdaj gratis ulaznicu', '›'],
            ['Promo kodovi', '12 aktivnih'],
          ]}
        />
      )
    case 'users':
      return (
        <Rows
          rows={[
            ['Tatjana', 'tickets, refunds, door'],
            ['Luka', 'moreskant, door'],
            ['Recepcija Korsal', 'partner'],
          ]}
        />
      )
    case 'stats':
      return (
        <Rows
          rows={[
            ['Sezona 2026', '5.412 ulaznica · 98.240 €'],
            ['Popunjenost', '71 %'],
          ]}
        />
      )
    default:
      return null
  }
}

// ── The frame: header, body, bar (phone) or sidebar (laptop) ────────────────

interface FrameProps {
  variant: VariantKey
  persona: Persona
  nav: Nav
  screen: ScreenKey
  device: 'phone' | 'laptop'
  setScreen: (k: ScreenKey) => void
  ws: Workspace | null
  setWs: (ws: Workspace) => void
}

function Frame(props: FrameProps) {
  const { variant, persona, nav, screen, device, setScreen, ws, setWs } = props
  const isPhone = device === 'phone'
  const hasScan = persona.permissions.includes('door')

  // Variant C: the active workspace decides the bar.
  const cws = nav.workspaces?.find((w) => w.ws === ws) ?? nav.workspaces?.[0]
  const tabs: ScreenKey[] = variant === 'C' && cws ? [...cws.tabs, 'more'] : nav.tabs
  const overflow: ScreenKey[] = variant === 'C' && cws ? cws.overflow : nav.overflow

  // The lit tab: the screen itself, or Više for anything reached from it.
  const active: ScreenKey = tabs.includes(screen) ? screen : 'more'

  // Variant B's full-screen door mode: no bar, one way out.
  const doorMode = variant === 'B' && screen === 'scan'

  const switchWs = (target: WorkspaceNav) => {
    setWs(target.ws)
    setScreen(target.tabs[0])
  }

  const header = (
    <header className="app__header proto__header">
      <div>
        {variant === 'C' && nav.workspaces && nav.workspaces.length > 1 && cws ? (
          <button
            className="proto__ws-switch"
            onClick={() => {
              const list = nav.workspaces!
              const i = list.findIndex((w) => w.ws === cws.ws)
              switchWs(list[(i + 1) % list.length])
            }}
            title="Promijeni radni prostor"
          >
            <span className="app__brand">Cecilija</span>
            <span className="proto__ws-name">{WS_LABEL[cws.ws]} ▾</span>
          </button>
        ) : (
          <h1 className="app__brand">Cecilija</h1>
        )}
        <p className="app__identity">
          <strong>{persona.name}</strong> · {persona.who}
        </p>
      </div>
      <p className="app__season">Sezona 2026</p>
    </header>
  )

  const body = (
    <main className="proto__body">
      {screen === 'home' ? (
        <HomeHub persona={persona} setScreen={setScreen} />
      ) : screen === 'more' ? (
        <MoreScreen
          variant={variant}
          overflow={overflow}
          nav={nav}
          setScreen={setScreen}
          switchWs={switchWs}
          hasScan={hasScan}
        />
      ) : (
        <>
          {doorMode ? (
            <div className="proto__doorbar">
              <button className="proto__back" onClick={() => setScreen('home')}>
                ‹ Zatvori skener
              </button>
            </div>
          ) : (
            <h2 className="app__page-title">{label(screen)}</h2>
          )}
          <StubBody k={screen} persona={persona} />
        </>
      )}
    </main>
  )

  if (isPhone) {
    return (
      <div className={`proto__phone${doorMode ? ' proto__phone--door' : ''}`}>
        <div className="proto__phone-scroll">
          {!doorMode && header}
          {body}
        </div>
        {!doorMode && (
          <nav className="proto__tabbar" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map((t) => (
              <button
                key={t}
                className={`app__tabbar-item proto__tab${t === active ? ' app__tabbar-item--on' : ''}`}
                onClick={() => setScreen(t)}
                aria-current={t === active ? 'page' : undefined}
              >
                <Icon k={t} />
                {label(t)}
              </button>
            ))}
          </nav>
        )}
      </div>
    )
  }

  // Laptop: a sidebar that never needs an overflow.
  return (
    <div className="proto__laptop">
      <aside className="proto__sidebar">
        <div className="proto__sidebar-brand">
          <span className="app__brand">Cecilija</span>
          <span className="proto__muted">{persona.name}</span>
        </div>
        {variant === 'B' && hasScan && (
          <button className="app__button proto__sidebar-scan" onClick={() => setScreen('scan')}>
            Skeniraj
          </button>
        )}
        <Sidebar variant={variant} nav={nav} screen={screen} setScreen={setScreen} />
        <div className="proto__sidebar-foot">
          <span>Postavke</span>
          <span>Odjava</span>
        </div>
      </aside>
      <div className="proto__laptop-main">
        <header className="proto__laptop-head">
          <span className="app__season">Sezona 2026</span>
        </header>
        {body}
      </div>
    </div>
  )
}

function Sidebar({
  variant,
  nav,
  screen,
  setScreen,
}: {
  variant: VariantKey
  nav: Nav
  screen: ScreenKey
  setScreen: (k: ScreenKey) => void
}) {
  const item = (k: ScreenKey) => (
    <button
      key={k}
      className={`proto__side-item${screen === k ? ' proto__side-item--on' : ''}`}
      onClick={() => setScreen(k)}
    >
      <Icon k={k} />
      {label(k)}
    </button>
  )
  if (variant === 'C' && nav.workspaces) {
    return (
      <>
        {nav.workspaces.map((w) => (
          <div key={w.ws} className="proto__side-group">
            <p className="proto__side-heading">{WS_LABEL[w.ws]}</p>
            {[...w.tabs, ...w.overflow].map(item)}
          </div>
        ))}
      </>
    )
  }
  const flat: ScreenKey[] =
    variant === 'B'
      ? ['home', ...nav.tabs.filter((t) => t !== 'home' && t !== 'more'), ...nav.overflow]
      : [...nav.tabs.filter((t) => t !== 'more'), ...nav.overflow]
  return <div className="proto__side-group">{flat.map(item)}</div>
}

/** Variant B's Početna: one card per duty, the door action on top on a show day. */
function HomeHub({ persona, setScreen }: { persona: Persona; setScreen: (k: ScreenKey) => void }) {
  const has = (p: Permission) => persona.permissions.includes(p)
  return (
    <>
      <h2 className="app__page-title">Dobar dan, {persona.name}</h2>
      {has('door') && (
        <button className="app__button proto__scan-cta" onClick={() => setScreen('scan')}>
          <Icon k="scan" /> Skeniraj ulaznice · večeras {TONIGHT.time}
        </button>
      )}
      {has('moreskant') && (
        <div className="app__hero">
          <p className="app__hero-eyebrow">
            <span>Ideš li?</span>
            <span>za 5 dana</span>
          </p>
          <p className="proto__hero-title">
            {TONIGHT.title} · {TONIGHT.date} · {TONIGHT.time}
          </p>
          <div className="proto__two">
            <button className="app__button">Dolazim</button>
            <button className="app__button proto__button--ghost">Ne mogu</button>
          </div>
        </div>
      )}
      {has('tickets') && (
        <button className="proto__card" onClick={() => setScreen('orders')}>
          <span className="app__hero-eyebrow">Blagajna</span>
          <span className="proto__hero-title">
            {TONIGHT.sold} / {TONIGHT.cap} prodano za {TONIGHT.date}
          </span>
          <span className="proto__muted">3 nove narudžbe danas · 1 novi upit ›</span>
        </button>
      )}
      {has('partner') && (
        <button className="proto__card" onClick={() => setScreen('sell')}>
          <span className="app__hero-eyebrow">Prodaja</span>
          <span className="proto__hero-title">Prodaj ulaznicu za {TONIGHT.date}</span>
          <span className="proto__muted">danas prodano 4 · ovaj mjesec 24 ›</span>
        </button>
      )}
      {has('users') && (
        <button className="proto__card" onClick={() => setScreen('users')}>
          <span className="app__hero-eyebrow">Uprava</span>
          <span className="proto__hero-title">1 pozivnica čeka</span>
        </button>
      )}
    </>
  )
}

const STANDING = ['Ljestvica', 'Obavijesti', 'Kalendar', 'Instalacija', 'Moj račun']

function MoreScreen({
  variant,
  overflow,
  nav,
  setScreen,
  switchWs,
  hasScan,
}: {
  variant: VariantKey
  overflow: ScreenKey[]
  nav: Nav
  setScreen: (k: ScreenKey) => void
  switchWs: (w: WorkspaceNav) => void
  hasScan: boolean
}) {
  if (variant === 'B') {
    const tiles: ScreenKey[] = [...(hasScan ? (['scan'] as ScreenKey[]) : []), ...overflow.filter((k) => k !== 'scan')]
    return (
      <>
        <h2 className="app__page-title">Više</h2>
        <div className="proto__tiles">
          {tiles.map((k) => (
            <button key={k} className="proto__tile" onClick={() => setScreen(k)}>
              <Icon k={k} />
              {label(k)}
            </button>
          ))}
          {STANDING.map((s) => (
            <button key={s} className="proto__tile proto__tile--quiet">
              {s}
            </button>
          ))}
        </div>
        <p className="proto__more-logout">Odjava</p>
      </>
    )
  }
  return (
    <>
      <h2 className="app__page-title">Više</h2>
      <nav className="app__more">
        {variant === 'C' && nav.workspaces && nav.workspaces.length > 1 && (
          <div className="proto__ws-list">
            <p className="proto__side-heading">Radni prostori</p>
            {nav.workspaces.map((w) => (
              <button key={w.ws} className="app__more-row proto__more-button" onClick={() => switchWs(w)}>
                {WS_LABEL[w.ws]}
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        )}
        {overflow.map((k) => (
          <button key={k} className="app__more-row proto__more-button" onClick={() => setScreen(k)}>
            {label(k)}
            <span aria-hidden="true">›</span>
          </button>
        ))}
        {STANDING.map((s) => (
          <span key={s} className="app__more-row proto__more-button proto__more-button--quiet">
            {s}
            <span aria-hidden="true">›</span>
          </span>
        ))}
      </nav>
      <p className="proto__more-logout">Odjava</p>
    </>
  )
}

// ── The prototype page: URL state + switcher + state panel ──────────────────

const VARIANT_KEYS: VariantKey[] = ['A', 'B', 'C']

function isScreenKey(v: string | null): v is ScreenKey {
  return v === 'home' || v === 'more' || (v !== null && v in SCREEN_BY_KEY)
}

export function NavPrototype() {
  const router = useRouter()
  const params = useSearchParams()

  const variantParam = params.get('variant')
  const variant: VariantKey = VARIANT_KEYS.includes(variantParam as VariantKey) ? (variantParam as VariantKey) : 'A'
  const persona = PERSONAS.find((p) => p.key === params.get('persona')) ?? PERSONAS[0]
  const device: 'phone' | 'laptop' = params.get('device') === 'laptop' ? 'laptop' : 'phone'
  const nav = useMemo(() => VARIANTS[variant].build(persona), [variant, persona])
  const wsParam = params.get('ws') as Workspace | null
  const ws = nav.workspaces?.some((w) => w.ws === wsParam) ? wsParam : (nav.workspaces?.[0].ws ?? null)
  const screenParam = params.get('screen')
  const screen: ScreenKey = isScreenKey(screenParam) ? screenParam : nav.landing

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k)
      else next.set(k, v)
    }
    router.replace(`?${next.toString()}`, { scroll: false })
  }
  const setVariant = (v: VariantKey) => set({ variant: v, screen: null, ws: null })
  const setPersona = (p: PersonaKey) => set({ persona: p, screen: null, ws: null })
  const setScreen = (k: ScreenKey) => set({ screen: k })
  const setWs = (w: Workspace) => set({ ws: w })
  const prevVariant = VARIANT_KEYS[(VARIANT_KEYS.indexOf(variant) + 2) % 3]
  const nextVariant = VARIANT_KEYS[(VARIANT_KEYS.indexOf(variant) + 1) % 3]

  // ← / → cycle variants, unless typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowRight') setVariant(nextVariant)
      if (e.key === 'ArrowLeft') setVariant(prevVariant)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const showSwitcher = process.env.NODE_ENV !== 'production'
  const cws = nav.workspaces?.find((w) => w.ws === ws)
  const barNow: ScreenKey[] = variant === 'C' && cws ? [...cws.tabs, 'more'] : nav.tabs
  const overflowNow = variant === 'C' && cws ? cws.overflow : nav.overflow

  return (
    <div className="proto">
      {showSwitcher && (
        <div className="proto__switcher">
          <div className="proto__switcher-row">
            <button onClick={() => setVariant(prevVariant)} aria-label="prethodna varijanta">
              ←
            </button>
            <strong>
              {variant} · {VARIANTS[variant].name}
            </strong>
            <button onClick={() => setVariant(nextVariant)} aria-label="sljedeća varijanta">
              →
            </button>
            <span className="proto__switcher-sep" />
            {PERSONAS.map((p) => (
              <button key={p.key} className={p.key === persona.key ? 'proto__on' : ''} onClick={() => setPersona(p.key)}>
                {p.name}
              </button>
            ))}
            <span className="proto__switcher-sep" />
            <button className={device === 'phone' ? 'proto__on' : ''} onClick={() => set({ device: 'phone', screen: null })}>
              Mobitel
            </button>
            <button className={device === 'laptop' ? 'proto__on' : ''} onClick={() => set({ device: 'laptop', screen: null })}>
              Laptop
            </button>
          </div>
          <p className="proto__switcher-blurb">{VARIANTS[variant].blurb}</p>
        </div>
      )}

      <Frame
        variant={variant}
        persona={persona}
        nav={nav}
        screen={screen}
        device={device}
        setScreen={setScreen}
        ws={ws}
        setWs={setWs}
      />

      {/* Surface the state: what the rule computed for this person. */}
      <aside className="proto__state">
        <p>
          <b>{persona.name}</b> drži:{' '}
          {persona.permissions.map((p) => (
            <code key={p}>{p}</code>
          ))}
        </p>
        <p>
          Traka: {barNow.map(label).join(' · ')}
          {variant === 'C' && cws && ` (radni prostor ${WS_LABEL[cws.ws]})`}
        </p>
        {variant === 'C' && nav.workspaces && (
          <p>
            Radni prostori:{' '}
            {nav.workspaces
              .map((w) => `${WS_LABEL[w.ws]} [${[...w.tabs, ...w.overflow].map(label).join(', ')}]`)
              .join(' · ')}
          </p>
        )}
        <p>Više sadrži: {overflowNow.map(label).join(', ') || 'samo stalne stavke'}</p>
        <p>Početni ekran: {label(nav.landing)}</p>
        <p>Skener: {nav.scanLives}</p>
        <p className="proto__muted">Tipke ← → mijenjaju varijantu. URL nosi sve: persona, variant, device, screen.</p>
      </aside>
    </div>
  )
}
