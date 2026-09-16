'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { canGoBack, readDepth } from '@/lib/app/nav-memory'
import { sessionStore } from '../session-store'

// The chevron every detail screen wears, and the one control in Cecilija that
// is a real Back (#666).
//
// It used to be a `<Link>` to the bare list root on all six detail screens, and
// calling that Back was the whole bug: a push is not a pop, so the browser
// restores nothing, the address arrives without the filter the reader had set,
// and `ScrollMemory` — which listens for `popstate` and nothing else — is never
// woken. Josip, from his phone: "kad se zelim vratiti na popis moreski, vrati me
// na pocetak liste, a ne tamo gdje sam bio."
//
// **It stays an `<a>` with a real `href`.** Rendered on the server it is the old
// link, which is the right answer for the reader a push notification dropped
// straight onto one nastup: there is nothing of ours behind them and
// `history.back()` would walk them out of the app. After hydration the same
// element intercepts a plain left-click and goes back for real — but only a
// plain one, so a middle-click, a Cmd-click and "open in new tab" keep working
// on the laptop sidebar, and so a reader with no JavaScript keeps a way back.
//
// Whether Back is safe is decided AT THE CLICK rather than at mount: the reader
// may have walked further in since this screen rendered, and a stale answer here
// is either a lost filter or an exit from the app.

/** A click the browser would handle as a plain navigation, and nothing else. */
function isPlainClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  )
}

export function BackControl({
  href,
  label,
}: {
  /** Where to go when there is nothing of ours behind: the list this belongs to. */
  href: string
  /** The accessible name; the chevron carries no text. */
  label: string
}) {
  const router = useRouter()

  return (
    <Link
      className="app__header-back"
      href={href}
      aria-label={label}
      onClick={(event) => {
        if (!isPlainClick(event)) return
        if (!canGoBack(readDepth(sessionStore()))) return
        event.preventDefault()
        router.back()
      }}
    >
      <ChevronLeft size={22} strokeWidth={2} aria-hidden="true" />
    </Link>
  )
}
