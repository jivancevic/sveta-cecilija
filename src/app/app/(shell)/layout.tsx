import { resolveAppViewer } from '@/lib/app/viewer'
import { Sidebar, TabBar } from '../AppNav'
import { PullToRefresh } from '../PullToRefresh'

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

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const viewer = await resolveAppViewer()

  return (
    <div className="app__frame">
      <Sidebar nav={viewer.nav} />

      {/* Everything that scrolls is inside the gesture (#562); the sidebar and
          the bar are outside it, because neither of them moves. */}
      <PullToRefresh>{children}</PullToRefresh>

      <TabBar nav={viewer.nav} />
    </div>
  )
}
