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
