// Reading the id out of a Payload relationship value.
//
// A relationship field arrives as a bare id at `depth: 0` and as a populated
// document at any greater depth, and callers rarely control which — a hook gets
// one shape, a `find` another. Three copies of this three-line function had
// grown across `/app` and the access layer by #423; this is the one.
//
// Two flavours, because both are genuinely needed:
//   - `relationId` keeps the id's own type, which is what a Payload `where` or
//     a write wants back (the Postgres adapter's columns are integers);
//   - `relationIdString` normalises to a string, which is what a `Map` key or
//     an id comparison wants, where `3` and `'3'` must be the same person.

/** The id a relationship holds, populated or not, with its own type kept. */
export function relationId(value: unknown): string | number | null {
  if (value == null) return null
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' || typeof id === 'number' ? id : null
  }
  return typeof value === 'string' || typeof value === 'number' ? value : null
}

/** The same id as a string, for map keys and comparisons. */
export function relationIdString(value: unknown): string | null {
  const id = relationId(value)
  return id == null ? null : String(id)
}

/**
 * A relationship id as the DATABASE wants it on a write.
 *
 * The mirror of the two readers above. Ids arrive as strings — off a URL, off a
 * JSON body — while the Postgres adapter's relationship columns are integers
 * and Payload validates the type on write: a `'38'` comes back as "The
 * following fields are invalid: Performance, Moreškant". Numeric-looking ids
 * are therefore coerced here, in one place: which type an id has is a database
 * fact and not a rule, so no pure handler should have to know it.
 */
export function relationIdForWrite(value: string | number | null): string | number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isInteger(n) && String(n) === String(value).trim() ? n : value
}
