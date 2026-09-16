'use client'

import type { NavStore } from '@/lib/app/nav-memory'

// `sessionStorage`, asked for safely, in one place (#666).
//
// Both halves of the back control need it — `NavMemory` writes the depth and
// `BackControl` reads it — and each had its own copy of this three-line
// try/catch, which is two places for one rule about one browser quirk.
//
// The quirk is why it cannot be a plain reference: some browsers throw on the
// ACCESS rather than on the call, so `window.sessionStorage` alone is enough to
// take a screen down in a private window or with site data blocked. Every
// storage read in `/app` is wrapped for this reason.

export function sessionStore(): NavStore | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
