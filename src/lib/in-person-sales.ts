import type { PoolQuery } from '@/lib/tickets/sold-seats'

export interface AddInPersonSalesInput {
  showId: string
  count: number
}

export interface AddInPersonSalesDeps {
  // Atomically increments in_person_sold by `delta` and returns the new total.
  // Returns null if the show does not exist. Implementations must be race-safe
  // (e.g. SQL `UPDATE … SET col = col + $1 RETURNING col`) — the helper
  // does not lock.
  atomicIncrement: (showId: string, delta: number) => Promise<{ inPersonSold: number } | null>
}

// Owns the atomic-increment SQL in one place (the route used to inline it). A
// single UPDATE statement does `col = col + $1`, so postgres serialises
// concurrent writes to the same row and no add is lost — never read-modify-write
// (see db-bootstrap.md / the atomic-columns hard rule). Returns the new total,
// or null when the show id matches no row. Takes a pool-query fn so it's unit-
// testable without a live DB.
export async function incrementInPersonSold(
  query: PoolQuery,
  showId: string,
  delta: number,
): Promise<{ inPersonSold: number } | null> {
  const res = await query(
    'UPDATE shows SET in_person_sold = COALESCE(in_person_sold, 0) + $1, updated_at = NOW() WHERE id = $2 RETURNING in_person_sold',
    [delta, Number(showId)],
  )
  if (res.rows.length === 0) return null
  return { inPersonSold: Number(res.rows[0].in_person_sold) }
}

export async function addInPersonSales(
  input: AddInPersonSalesInput,
  deps: AddInPersonSalesDeps,
): Promise<{ inPersonSold: number }> {
  if (!Number.isInteger(input.count)) throw new Error('Count must be an integer')
  if (input.count <= 0) throw new Error('Count must be a positive integer')
  const result = await deps.atomicIncrement(input.showId, input.count)
  if (!result) throw new Error('Show not found')
  return { inPersonSold: result.inPersonSold }
}
