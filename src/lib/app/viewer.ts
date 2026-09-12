import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { relationId } from '@/lib/payload-relation'
import { decideAppAccess, type AppAccess, type AppMember } from './access'

// Who is asking, resolved once per `/app` request (#421).
//
// Two things the pure decision in ./access.ts cannot do for itself:
//
//  1. **Read the Member behind the login.** `payload.auth()` does hand back
//     `member` — its JWT strategy loads the account through the local API with
//     `overrideAccess: true`, which is the same reason `permissions` reaches
//     `can()`, so the `users` field lock on `Users.member` never applies there.
//     We re-read the account and its Member anyway, with `overrideAccess`: the
//     Member row is a second document the session never carried, and re-reading
//     the link with it means a session issued before a relink cannot decide who
//     a dancer is. Defence in depth, not a necessity.
//  2. **Tell "signed out" from "denied".** An anonymous visitor is redirected to
//     `/app/login`; a signed-in account without the roster permissions gets the
//     "Nemate pristup" page. Same absence of access, two different answers, so
//     the caller needs to know which.
//
// The AppMember it builds is an explicit projection, never a spread of the
// Payload doc: `members.email` exists (#420) and must never reach an `/app`
// payload (ADR-0024's PII boundary).

export interface AppViewer {
  /** Null when there is no session at all: the caller redirects to /app/login. */
  signedIn: boolean
  access: AppAccess
  /**
   * The RAW `Users.member` link, whether or not it resolves to a usable dancer.
   *
   * The decision deliberately collapses "no link" and "a link to a retired or
   * un-flagged Member" into the same `self: null` (#421), which is right for
   * every screen that asks "is there a dancer here". `/app/povezi` is the one
   * that asks the other question — may this account still be linked at all
   * (#462) — and without this it would offer a list whose every tap 409s.
   */
  memberLinkId: string | null
}

/** Payload doc → the projection `/app` renders. Emails are deliberately absent. */
export function toAppMember(doc: Record<string, unknown> | null | undefined): AppMember | null {
  if (!doc || doc.id == null) return null
  const roles = Array.isArray(doc.roles) ? doc.roles.filter((r): r is string => typeof r === 'string') : []
  return {
    id: String(doc.id),
    name: typeof doc.name === 'string' ? doc.name : null,
    nickname: typeof doc.nickname === 'string' ? doc.nickname : null,
    mobile: typeof doc.mobile === 'string' ? doc.mobile : null,
    roles,
    primaryRole: typeof doc.primaryRole === 'string' ? doc.primaryRole : null,
    active: doc.active !== false,
    isMoreskant: doc.isMoreskant === true,
  }
}

export async function resolveAppViewer(): Promise<AppViewer> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return { signedIn: false, access: { kind: 'denied' }, memberLinkId: null }

  // Re-read the link and the Member row itself: see the header note.
  let memberDoc: Record<string, unknown> | null = null
  let memberLinkId: string | null = null
  try {
    const account = await payload.findByID({
      collection: 'users',
      id: user.id,
      depth: 0,
      overrideAccess: true,
    })
    const memberId = relationId((account as Record<string, unknown> | null)?.member)
    memberLinkId = memberId == null ? null : String(memberId)
    if (memberId != null) {
      memberDoc = (await payload.findByID({
        collection: 'members',
        id: memberId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Record<string, unknown>
    }
  } catch {
    // A dangling link (the Member was deleted between two requests) is not an
    // error page: it is simply no dancer identity, which the decision handles.
    memberDoc = null
  }

  return {
    signedIn: true,
    access: decideAppAccess(user as { permissions?: unknown }, toAppMember(memberDoc)),
    memberLinkId,
  }
}
