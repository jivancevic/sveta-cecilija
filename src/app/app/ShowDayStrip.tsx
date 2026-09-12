import Link from 'next/link'
import { isDoorShowToday } from '@/lib/app/scan-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { getNextShow } from '@/lib/shows'

// The show-day strip (#472, built with Skener in #504).
//
// A door volunteer who holds more than `door` — a voditelj who also works the
// gate, the secretary on a busy night — may be reading any screen when the
// evening starts. One line takes them to the scanner, and only on the day: a
// standing "Skeniraj" banner on every screen all season is chrome, not help.
//
// It costs one `getNextShow()` per render, which is why the shell only mounts
// it for a `door` holder and never on Skener itself, where the ring says the
// same thing with a number on it.

export async function ShowDayStrip() {
  const next = await getNextShow()
  if (!isDoorShowToday(next?.date ?? null)) return null

  return (
    <Link className="app__daystrip" href="/app/scan">
      <b>{APP_STRINGS.scan.stripToday}</b>
      <span>{APP_STRINGS.scan.open} ›</span>
    </Link>
  )
}
