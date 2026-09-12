import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NavPrototype } from './NavPrototype'

// PROTOTYPE, throwaway (#472, Cecilija map #471). Lives on the
// `prototype/cecilija-nav` branch only and never merges: it sits outside the
// `/app` access decision on purpose, because it SIMULATES four people with
// different permission sets instead of reading a session.
//
// Three variants of Cecilija's navigation, switchable via `?variant=`, on the
// throwaway route `/app/prototype/nav` (sub-shape B: the shell itself is the
// thing under test, so no existing page can host it).

export const metadata: Metadata = {
  title: 'Prototip navigacije · Cecilija',
  robots: { index: false, follow: false },
}

export default function NavPrototypePage() {
  return (
    <Suspense fallback={null}>
      <NavPrototype />
    </Suspense>
  )
}
