export interface AddInPersonSalesInput {
  showId: string
  count: number
}

export interface AddInPersonSalesDeps {
  findShow: (id: string) => Promise<{ id: string; onlineSold: number; inPersonSold: number } | null>
  updateShow: (id: string, data: { inPersonSold: number }) => Promise<void>
}

export async function addInPersonSales(
  input: AddInPersonSalesInput,
  deps: AddInPersonSalesDeps,
): Promise<{ inPersonSold: number }> {
  if (!Number.isInteger(input.count)) throw new Error('Count must be an integer')
  if (input.count <= 0) throw new Error('Count must be a positive integer')
  const show = await deps.findShow(input.showId)
  if (!show) throw new Error('Show not found')
  const next = show.inPersonSold + input.count
  await deps.updateShow(show.id, { inPersonSold: next })
  return { inPersonSold: next }
}
