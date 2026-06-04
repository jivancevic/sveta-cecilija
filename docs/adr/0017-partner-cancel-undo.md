# Partner cancel is delete-then-undo, with a bounded same-day restore

The partner dashboard fronts storno with a **delete-then-undo** UX (no confirm dialog): tapping the trash **voids immediately** and a short banner offers a one-tap **Undo** for a few seconds (whole order **6 s**, single ticket **4 s**). Undo calls a **restore** operation that re-activates the just-storno'd tickets — `tickets.status='active'` for rows whose `cancel_reason='storno'` — re-checking partner ownership + the same-day Europe/Zagreb window + that the seat is **still free** (under the per-show advisory sell lock, mirroring `createPartnerSale`), and **soft-failing** ("Nije moguće poništiti, mjesto je zauzeto") if the seat was retaken in the interim.

This **amends [ADR-0008](0008-partner-sales-channel.md)**, whose storno was a one-way, terminal void. **Restore is the only un-void path**: refund voids and any expired-window storno stay permanent.

## Considered options

- **Deferred / "pending" delete** (don't void until the window lapses, undo just cancels it) — rejected: leaves a half-freed seat for the window, and breaks if the partner navigates away mid-window (the delete may never commit).
- **Keep the confirm dialog** ("Otkazati narudžbu? Da/Ne") — rejected: two taps and *no* recovery once confirmed. Delete-then-undo is one tap **and** a real recovery window.

## Consequences

- A new `POST /api/partner/storno/undo` route + un-void primitive; the restore must take the same per-show sell lock as a sale, since re-activating tickets re-takes seats and could otherwise oversell.
- Stats / month-to-date / the recent-orders list all derive from active tickets, so they self-correct on both the void and the restore with no extra bookkeeping.
