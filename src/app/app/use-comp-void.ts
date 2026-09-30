'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { pluralize } from '@/lib/app/roster-loaders'
import type { CompVoidCounts } from '@/lib/comp/cancel-comp'

// Poništi gratis, as a request (#701). Two screens offer it — Gratis's list of
// the newest comps and the comp order on Narudžbe — and both call the one
// `POST /api/comp/cancel`, so the request and the Croatian sentence each
// refusal becomes live here once rather than twice.
//
// Nothing is optimistic: the void runs `UPDATE tickets … WHERE status='active'
// AND scanned=false` on the server, so the honest answer only exists after the
// round trip, and a success calls `router.refresh()` so the server re-renders
// the rows.

const S = APP_STRINGS.gratis

/** The whole-order confirmation, with both of `compVoidCounts()`'s numbers. */
export function compVoidOrderBody(code: string, counts: CompVoidCounts): string {
  return S.confirmOrderBody(
    code,
    pluralize(counts.voidable, S.ticketCount),
    counts.keptScanned > 0 ? pluralize(counts.keptScanned, S.ticketCount) : null,
  )
}

export interface CompVoidTarget {
  orderId: string
  /** One ticket under the order; the whole order when absent. */
  ticketId?: string
}

export function useCompVoid<T extends CompVoidTarget>() {
  const router = useRouter()
  const [target, setTarget] = useState<T | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function ask(next: T) {
    setTarget(next)
    setError(null)
    setDone(null)
  }

  function close() {
    setTarget(null)
    setError(null)
  }

  async function confirm() {
    if (!target || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/comp/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          target.ticketId
            ? { orderId: target.orderId, ticketId: target.ticketId }
            : { orderId: target.orderId },
        ),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { code?: string } | null
        // The route speaks English to `/admin`; the reader gets the reason.
        setError(
          body?.code === 'TICKET_SCANNED'
            ? S.scannedRefused
            : body?.code === 'NOTHING_TO_VOID'
              ? S.nothingToVoid
              : S.cancelFailed,
        )
        return
      }
      setTarget(null)
      setDone(S.cancelled)
      router.refresh()
    } catch {
      setError(S.network)
    } finally {
      setBusy(false)
    }
  }

  return { target, busy, error, done, ask, close, confirm }
}
