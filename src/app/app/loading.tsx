import { APP_STRINGS } from '@/lib/app/strings'

// The frame, while the screen behind it is still being rendered (#593).
//
// Every screen in Cecilija is `force-dynamic`, so a cold tap — the first one
// after the app was opened, or one the router cache has let go — waits on a
// server roundtrip. Without this the phone holds the OLD screen for the length
// of that wait and then jumps. With it the tap paints the shape of the next
// screen in the same frame and fills it in when the data lands.
//
// **One skeleton for twelve screens, deliberately.** A per-screen skeleton is a
// second copy of a layout that then drifts from the real one, and the reader is
// looking at it for 200 ms. What it draws is the shape every screen shares: the
// title line, one hero-sized block, four rows. It is `aria-hidden` and carries
// no text at all, because a word in a placeholder is a word that flashes and is
// then replaced by a different one; the wait is said once, quietly, for a
// screen reader that cannot see the shapes.
//
// It wears `app__shell` because that is the column every screen is rendered in:
// the same 640px, the same gutters, the same room left for the floating bar, so
// the skeleton's rows are exactly where the real rows land.
//
// The shimmer is CSS only (`app.css`) and it stops under
// `prefers-reduced-motion: reduce`.

export default function AppLoading() {
  return (
    <div className="app__shell">
      <div className="app__skeleton" aria-hidden="true">
        <div className="app__sk app__sk--title" />
        <div className="app__sk app__sk--hero" />
        <div className="app__sk app__sk--row" />
        <div className="app__sk app__sk--row" />
        <div className="app__sk app__sk--row" />
        <div className="app__sk app__sk--row" />
      </div>
      <p className="app__sr-only" role="status" aria-live="polite">
        {APP_STRINGS.ui.loading}
      </p>
    </div>
  )
}
