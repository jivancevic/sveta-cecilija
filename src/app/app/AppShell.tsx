import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { AppMember } from '@/lib/app/access'
import type { AppScreenKey } from '@/lib/app/screens'
import { screenByKey } from '@/lib/app/screens'
import { APP_STRINGS, ROLE_LABELS } from '@/lib/app/strings'
import type { AppViewer } from '@/lib/app/viewer'
import type { DanceRole } from '@/lib/moreskant-profile'
import { NotificationBell } from './NotificationBell'

// The header every screen wears, and the column it is rendered in (#495, #593).
//
// A plain server component: the navigation that needed the browser moved into
// the route group's layout with the rest of the persistent chrome, and what is
// left here is server-rendered text. A screen page stays what it was:
// server-rendered data with no store.
//
// The header is the same everywhere (#473): the screen's title on the left, the
// notification bell on the right, phone and laptop alike. **Početna is the one
// exception and the only screen with the logo** (#564): its left-hand side is
// the mark and the wordmark, because a landing screen titled "Početna" would
// name the tab the reader just pressed instead of naming the app they are in.
// One screen carries the brand and eleven carry their own name.
//
// The bell landed with
// the inbox (#496) and is now unconditional — it is the one control that is on
// every screen, and a slot that appeared and disappeared with a screen's own
// `actions` would move the bell under the reader's thumb. A screen's `actions`
// sit to its left in the same slot.
//
// "Odjava" is NOT in the header: it lives in Više, where the things a person
// does once a season live. A header button that ends the session sitting one
// thumb-width from the season label was a mis-tap waiting to happen.
//
// **Since #593 it is the HEADER and the column, and nothing else.** The
// sidebar, the bar and the pull gesture moved into `(shell)/layout.tsx`, which
// is the one thing in `/app` that survives a client navigation, so they no
// longer tear down and rebuild on every tab tap. What is left here is what is
// genuinely per-page — a title, a season, a screen's own actions — and that
// SHOULD be re-rendered when the page changes.
//
// It still remounts on every navigation, so nothing that has to survive one can
// keep its state here: a ref set before a `popstate` belongs to an instance
// that is already gone by the time the next screen mounts. That is why
// `ScrollMemory` lives in the root `layout.tsx` (#562 review).

/** "Cici · Crni kralj, Crni" — the small identity line of story 36. */
export function identityLine(member: {
  nickname?: string | null
  roles?: string[]
  primaryRole?: string | null
}): string {
  const ordered = [
    ...(member.primaryRole ? [member.primaryRole] : []),
    ...(member.roles ?? []).filter((r) => r !== member.primaryRole),
  ]
  const labels = ordered.map((r) => ROLE_LABELS[r as DanceRole] ?? r)
  return labels.length > 0 ? labels.join(', ') : APP_STRINGS.header.noRoles
}

export function AppShell({
  viewer,
  screen,
  title,
  brand = false,
  season,
  back,
  actions,
  intro,
  children,
}: {
  /** Resolved once by the page; the navigation is read straight off it. */
  viewer: AppViewer
  /** The screen this page belongs to: names it and lights its tab. */
  screen?: AppScreenKey
  /** A title of the page's own, when the screen's label is not specific enough. */
  title?: string
  /**
   * Wear the logo and the wordmark instead of a title. Početna, and nowhere
   * else (#564): Cecilija is named once.
   */
  brand?: boolean
  /** The season label under the title; omitted where it means nothing. */
  season?: number | null
  /**
   * The way back, for a screen that is always reached from another one (#614).
   *
   * In the HEADER, left of the title, where iOS puts it and where a thumb goes
   * looking. It used to be a full row under the title on the two screens that
   * have one — the full list and a dancer's profile — which spent a whole row
   * of a phone on a link, on screens where every row is a person.
   */
  back?: { href: string; label: string }
  /** Extra controls left of the bell. The bell itself is always there (#496). */
  actions?: React.ReactNode
  /** A block between the header and the content (the performance detail's). */
  intro?: React.ReactNode
  children: React.ReactNode
}) {
  const heading = title ?? (screen ? screenByKey(screen).label : APP_STRINGS.name)

  return (
    <div className="app__shell">
      <header className={`app__header${brand ? ' app__header--brand' : ''}`}>
        {brand ? (
          <div className="app__header-brand">
            {/* Decorative: the wordmark beside it is the accessible name. */}
            <Image
              className="app__logo"
              src="/cecilija-logo.webp"
              alt=""
              width={32}
              height={40}
              priority
            />
            <h1 className="app__wordmark">{APP_STRINGS.landing.brand}</h1>
          </div>
        ) : (
          <div className="app__header-title">
            {back && (
              <Link className="app__header-back" href={back.href} aria-label={back.label}>
                <ChevronLeft size={22} strokeWidth={2} aria-hidden="true" />
              </Link>
            )}
            <div className="app__header-heading">
              <h1>{heading}</h1>
              {season != null && (
                <p className="app__season">
                  {APP_STRINGS.list.season} {season}
                </p>
              )}
            </div>
          </div>
        )}
        <div className="app__header-actions">
          {actions}
          <NotificationBell unread={viewer.unreadNotifications} />
        </div>
      </header>

      {intro}
      {children}
    </div>
  )
}

export type { AppMember }
