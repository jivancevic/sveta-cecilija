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
