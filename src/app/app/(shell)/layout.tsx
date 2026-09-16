import { appKeeperWork } from '@/lib/app/session-renewal-data'
import { resolveAppViewer } from '@/lib/app/viewer'
import { Sidebar, TabBar } from '../AppNav'
import { PullToRefresh } from '../PullToRefresh'
import { ScreenTransition } from '../ScreenTransition'
import { SessionKeeper } from '../SessionKeeper'

// The chrome that does NOT remount (#593).
//
// Until now `AppShell` carried the sidebar, the bar and the gesture, and every
// page.tsx rendered it — so a tab tap tore all three down and built them again,
// which on a phone is the flash between two screens and the reason the bar's
// pill could not be animated into its new place. A layout is the one thing in
// the App Router that survives a navigation, so that is where they live.
//
// **`(shell)` is a route group and changes no URL.** The parentheses are the
// whole point: `/app/orders` is still `/app/orders`. What the folder does is
// draw the line between the screens that wear the chrome and the pages that
// must not — `login`, `forgot`, `session`, `join/[code]`, `install`,
// `authorize` and `welcome`, every one of them a page a person reaches with no
// session, or before the access decision has an answer. Those stay one level
// up, next to this group, and get the root layout alone.
//
// The viewer is resolved HERE, once, and `resolveAppViewer` is wrapped in
// React's `cache`, so the page's own `openScreen()` below reuses this very
// resolution rather than asking Payload a second time. **The gate stays on the
// page**: a layout cannot refuse a screen it does not know the name of, and
// `redirect()` from a layout would fire on every route under it.
//
// `Sidebar` and `TabBar` render nothing at all when the navigation is empty,
// which is exactly the denied case — the refusal panel gets no bar offering
// more doors to the same refusal.

// It is also the seam where the session slides (#650, ADR-0028 decision 1): a
// cookie older than seven days is re-issued for another thirty, so a dancer who
// opens the app at all never falls out — which matters because most of the
// roster has no e-mail and therefore no way back in. The decision is the
// server's and the `Set-Cookie` is a route's, because a layout cannot set one;
// the reasoning is in `lib/app/session-renewal-data.ts`.
//
// #652 hangs off the same seam rather than building a second one: the same
// server decision, the same one background POST, now also carrying "this
// browser is (or is not) an installed app" so the roster can finally tell who
// actually has Cecilija. Neither flag is set on a normal load, and then this
// component is not in the tree at all.
//
// #669 adds a third flag with a weaker promise: a browser that has never
// reported itself installed is asked on every load, because the six-hour
// throttle made "Ana installed it an hour ago" look exactly like "Ana never
// installed it". It costs nothing when the answer is no — the component reads a
// media query and returns without calling — and it can only ever turn a mark on.

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const [viewer, keeper] = await Promise.all([resolveAppViewer(), appKeeperWork()])

  return (
    <div className="app__frame">
      {viewer.signedIn &&
      (keeper.renewSession || keeper.recordDevice || keeper.confirmStandalone) ? (
        <SessionKeeper
          recordDevice={keeper.recordDevice}
          renewSession={keeper.renewSession}
          confirmStandalone={keeper.confirmStandalone}
        />
      ) : null}

      <Sidebar nav={viewer.nav} />

      {/* Everything that scrolls is inside the gesture (#562); the sidebar and
          the bar are outside it, because neither of them moves. */}
      <PullToRefresh>
        {/* Keyed on the pathname: the new screen slides in from the side its
            tab sits on, the bar and the sidebar do not move at all (#593). */}
        <ScreenTransition nav={viewer.nav}>{children}</ScreenTransition>
      </PullToRefresh>

      <TabBar nav={viewer.nav} />
    </div>
  )
}
