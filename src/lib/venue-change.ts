import type { Venue } from './venues'

// Pure orchestration for the bad-weather "move a show Ljetno → Zimsko" admin
// action (#94). The route wires the real DB + Brevo; this stays DI + testable.
//
// Idempotency lives in deps.claimMove: an atomic
//   UPDATE shows SET venue='zimsko-kino', venue_changed_at=NOW(),
//          venue_changed_by_id=$user
//   WHERE id=$show AND venue='ljetno-kino' AND venue_changed_at IS NULL
//   RETURNING id
// Claim FIRST, then send mail — so two concurrent confirmations can never
// double-notify buyers. A second call claims nothing → reported as already
// moved, no mail.
//
// This notice is TRANSACTIONAL, not marketing: it concerns a ticket the buyer
// already holds and a material change to it, so it deliberately does NOT honour
// the marketing_optouts list (#57). Only the post-show review email — genuine
// marketing — checks that list.

export interface VenueChangeShow {
  id: string
  date: string
  time: string
  venue: Venue
  venueChangedAt: string | null
}

export interface VenueChangeBuyer {
  orderId: string
  name: string
  email: string
  locale: 'en' | 'hr' | null
}

export interface MoveToZimskoInput {
  showId: string
  userId: string
}

export interface MoveToZimskoDeps {
  getShow: (showId: string) => Promise<VenueChangeShow | null>
  findBuyers: (showId: string) => Promise<VenueChangeBuyer[]>
  /** Atomic claim. Returns true only if this call performed the move. */
  claimMove: (showId: string, userId: string) => Promise<boolean>
  /** Best-effort send; returns true on success, false on failure (logged). */
  sendVenueChangeEmail: (buyer: VenueChangeBuyer, show: { date: string; time: string }) => Promise<boolean>
}

export type MoveToZimskoResult =
  | { status: 'moved'; total: number; sent: number; failed: number }
  | { status: 'already-moved'; venueChangedAt: string | null }
  | { status: 'not-applicable'; venue: Venue }

export async function moveShowToZimsko(
  input: MoveToZimskoInput,
  deps: MoveToZimskoDeps,
): Promise<MoveToZimskoResult> {
  const show = await deps.getShow(input.showId)
  if (!show) throw new Error('Show not found')

  if (show.venueChangedAt) {
    return { status: 'already-moved', venueChangedAt: show.venueChangedAt }
  }
  if (show.venue !== 'ljetno-kino') {
    // Natively a Zimsko show (or already elsewhere) — nothing to move.
    return { status: 'not-applicable', venue: show.venue }
  }

  const claimed = await deps.claimMove(input.showId, input.userId)
  if (!claimed) {
    // Lost the race to a concurrent confirmation — it sent the mail.
    return { status: 'already-moved', venueChangedAt: null }
  }

  const buyers = await deps.findBuyers(input.showId)
  let sent = 0
  let failed = 0
  for (const buyer of buyers) {
    const ok = await deps.sendVenueChangeEmail(buyer, { date: show.date, time: show.time })
    if (ok) sent++
    else failed++
  }

  return { status: 'moved', total: buyers.length, sent, failed }
}

export interface PreviewVenueMoveResult {
  alreadyMoved: boolean
  venue: Venue
  venueChangedAt: string | null
  buyerCount: number
  sampleEmails: string[]
}

export async function previewVenueMove(
  showId: string,
  deps: Pick<MoveToZimskoDeps, 'getShow' | 'findBuyers'>,
): Promise<PreviewVenueMoveResult> {
  const show = await deps.getShow(showId)
  if (!show) throw new Error('Show not found')
  const buyers = await deps.findBuyers(showId)
  return {
    alreadyMoved: !!show.venueChangedAt,
    venue: show.venue,
    venueChangedAt: show.venueChangedAt,
    buyerCount: buyers.length,
    sampleEmails: buyers.slice(0, 5).map((b) => b.email),
  }
}
