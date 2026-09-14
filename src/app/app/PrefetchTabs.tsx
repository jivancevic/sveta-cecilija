'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Warm the router cache with every screen in the bar (#593).
//
// `prefetch={true}` on the links is the first half: it tells Next to fetch the
// FULL payload of a dynamic route rather than the loading frame alone. This is
// the second half, and it is the one that matters on a phone: a bottom bar is
// five targets a thumb never hovers, so the viewport-based prefetch that fires
// when a `next/link` scrolls into view is the only thing that would ever warm
// them, and it warms them one tap too late. Asking the router directly, once,
// on mount, is what makes the next tap render from cache instead of waiting on
// a server roundtrip.
//
// `staleTimes` stays at its default, which is why every write in `/app` has to
// call `router.refresh()` after it succeeds: a cached tab that nobody refreshed
// is a tab showing yesterday's answer.
//
// A phone on Save Data is left alone: prefetching four screens nobody asked for
// is exactly the traffic that setting exists to refuse.

interface SaveDataNavigator extends Navigator {
  connection?: { saveData?: boolean }
}

export function PrefetchTabs({ routes }: { routes: string[] }) {
  const router = useRouter()
  // A joined string rather than the array itself: a fresh array literal on
  // every render of the layout would re-run this effect on every navigation.
  const key = routes.join('|')

  useEffect(() => {
    const conn = (navigator as SaveDataNavigator).connection
    if (conn?.saveData === true) return
    for (const route of key.split('|')) {
      if (route !== '') router.prefetch(route)
    }
  }, [router, key])

  return null
}
