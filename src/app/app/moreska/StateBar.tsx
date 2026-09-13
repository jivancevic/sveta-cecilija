'use client'

import { useRouter } from 'next/navigation'
import { ArmyBar } from '../ui'

// The ArmyBar under the hero, and the way into Stanje (#565).
//
// `ArmyBar` is a button when it is given an `onClick` (T1), and an `onClick` is
// the one thing a server component cannot hand it — so this is four lines of
// client whose whole job is the navigation. Not a `Link` wrapped around it: the
// bar already draws its own pressed state and its own chevron, and a link
// around a button is two focus stops for one target.
//
// The destination is a prop rather than a path spelled here: which evening the
// bar opens is a fact about the hero above it, and `moreska-screen.ts` is where
// this screen's hrefs are decided and tested (`/app/moreska/[id]` since #566).

export function StateBar({
  crni,
  bili,
  threshold,
  href,
}: {
  crni: number
  bili: number
  threshold: { crni: number; bili: number }
  href: string
}) {
  const router = useRouter()
  return (
    <ArmyBar
      crni={crni}
      bili={bili}
      threshold={threshold}
      onClick={() => router.push(href)}
    />
  )
}
