// Who is pressing the button on Korisnici (#510).
//
// Four routes need the same two facts about the caller — their id and whether
// several people are them — and both come off the account Payload already
// authenticated. `shared` rides along on `req.user` even though it is
// field-locked to a `users` holder, because Payload's JWT strategy loads the
// account through the local API with `overrideAccess: true` (the same reason
// `permissions` reaches `can()`).
//
// Written once so the four routes cannot disagree about what "the caller" is,
// and separate from `users-data.ts` so it carries no `getRepo()` import.

import type { UsersCaller } from './users-admin'

export function callerOf(user: { id: string | number; shared?: unknown }): UsersCaller {
  return { id: String(user.id), shared: user.shared === true }
}
