// Reading one performance row inside a `/api/app` write route (#658).
//
// Four routes now load the same row for the same reason — `keepsList` has to be
// asked against it — and each was opening the row the same way: `findByID` at
// `depth: 0` with `overrideAccess`, wrapped in a `try` so a bad id in a URL or a
// body is the handler's 400 rather than a 500 from the loader.
//
// It is deliberately a thin pair and not a repository: the four routes want four
// different PROJECTIONS of the row (a start instant, a kind, a date and time)
// and each of those belongs beside the rule that reads it. What they share is
// the opening and the one field this ticket added, so that is what lives here.

/** Payload's local API, narrowed to the single read this makes. */
export interface ShowRowReader {
  findByID: (args: {
    collection: 'shows'
    id: string
    depth: number
    overrideAccess: boolean
  }) => Promise<unknown>
}

/**
 * One performance row, or null when there is no such row.
 *
 * `overrideAccess` because the local API gates nothing anyway (CLAUDE.md): every
 * caller re-checks its permission in the handler and then asks `keepsList` about
 * what comes back.
 */
export async function loadShowRow(
  payload: ShowRowReader,
  id: string,
): Promise<Record<string, unknown> | null> {
  try {
    const doc = (await payload.findByID({
      collection: 'shows',
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown> | null
    return doc ?? null
  } catch {
    // A bad id is the handler's 400, never a 500 from here.
    return null
  }
}

/**
 * The evening's Zaduženi, as the row carries them.
 *
 * At `depth: 0` they are bare Member ids, which is the shape `keepsList` reads;
 * a row from before the column existed has none, and `[]` says that without any
 * caller having to know it could be absent.
 */
export function listKeepersOf(doc: Record<string, unknown>): unknown[] {
  return Array.isArray(doc.listKeepers) ? doc.listKeepers : []
}
