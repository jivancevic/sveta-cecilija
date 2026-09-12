'use client'

import { useEffect } from 'react'
import { migrateLegacyServiceWorker } from './push-client'

// The rebrand's one moving part on a phone (#489).
//
// Renaming `moreskant-sw.js` to `cecilija-sw.js` leaves every device that
// installed the old app holding a registration whose script is gone. Nothing
// tells that device; its push simply stops. So every `/app` load asks
// `push-client.ts` to repair it, which on a device that never had the old
// worker is one `getRegistrations()` call and nothing else.
//
// It renders nothing and it is mounted in the layout rather than on a screen,
// because the screen the two affected phones open first is not knowable.
//
// This component is DELETABLE once the roster's devices have all opened the app
// after the rebrand: it is a migration, not a feature.

export function ServiceWorkerMigration({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  useEffect(() => {
    void migrateLegacyServiceWorker(vapidPublicKey)
  }, [vapidPublicKey])

  return null
}
