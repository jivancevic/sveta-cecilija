import { cache } from 'react'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { relationId } from '@/lib/payload-relation'
import { can, permissionsOf, type Permission } from '@/lib/access/permissions'
import { decideAppAccess, type AppAccess, type AppMember } from './access'
import { poolQuery, unreadNotificationCount } from './notifications-store'
import type { AppNav } from './screens'

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
  /** The account's own id, for the screens whose rows belong to an ACCOUNT (#496). */
  userId: string | null
  access: AppAccess
  /**
   * The RAW `Users.member` link, whether or not it resolves to a usable dancer.
   *
   * The decision deliberately collapses "no link" and "a link to a retired or
   * un-flagged Member" into the same `self: null` (#421), which is right for
   * every screen that asks "is there a dancer here". `/app/account` is the one
   * that asks the other question — may this account still be linked at all
   * (#462) — and without this it would offer a list whose every tap 409s.
   */
  memberLinkId: string | null
  /** The account's own dancer row: `access.self`, hoisted for the chrome. */
  me: AppMember | null
  /**
   * Whom this login belongs to (#510), or null on a shared one (ADR-0022).
   *
   * Read for Početna's greeting (#564), which names the reader and never the
   * username: `tehnika` is a room and `member` is the society, so a login with
   * no name of its own is greeted by nobody's name rather than by its own.
   */
  accountName: string | null
  /**
   * The reader's OWN e-mail address, or null (#651, ADR-0028).
   *
   * ADR-0024 keeps a dancer's address out of `/app`, and this narrows that
   * rather than reversing it: it is the reader's own, on their own row, and it
   * is rendered on exactly one screen — the "E-mail i lozinka" field on Profil,
   * which is where they write it. No client component is handed the viewer, so
   * nothing else can put it into HTML by accident, and Početna reads only
   * whether it is null.
   */
  email: string | null
  /**
   * Has the reader ever CHOSEN their own password? (`users.passwordSetAt`.)
   *
   * The other half of "do I hold a key of my own", and the half that cannot be
   * inferred: every invited account carries a random password minted by
   * `ensureDancerLogin`, so a hash proves nothing. Read as a boolean only, and
   * only so Početna's card knows whether the task is finished (#653 review).
   */
  hasOwnPassword: boolean
  /**
   * The login's own name (ADR-0011), for the one header that has nothing else.
   *
   * Više names the reader (#569), and a shared account has no person to name:
   * `tehnika` is a room and `member` is the society. The username is what those
   * two are called out loud at a rehearsal, so it stands in for the name there
   * and nowhere else. A named person's login never shows it.
   */
  username: string | null
  /**
   * A login several people hold (ADR-0022's only marker of one).
   *
   * Početna greets a person and a shared login is not one, so `tehnika` and
   * `member` get the wordmark and no greeting at all rather than a "Dobra
   * večer." addressed to a room (#564).
   */
  shared: boolean
  /** The navigation this permission set produces; empty when denied. */
  nav: AppNav
  /** The permission set itself, so a screen can ask `can()` without re-reading. */
  permissions: Permission[]
  /** Holds `moreska`: the roster's lead, whatever else they hold. */
  voditelj: boolean
  /** The bell's number (#496): unread rows of this ACCOUNT's Sandučić obavijesti. */
  unreadNotifications: number
}

const DENIED: AppViewer = {
  signedIn: false,
  userId: null,
  access: { kind: 'denied' },
  memberLinkId: null,
  me: null,
  accountName: null,
  email: null,
  hasOwnPassword: false,
  username: null,
  shared: false,
  nav: { tabs: [], overflow: [], landing: null, groups: [] },
  permissions: [],
  voditelj: false,
  unreadNotifications: 0,
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

/** Payload's local API, narrowed to the two reads the resolution makes. */
export interface ViewerPayload {
  findByID: (args: Record<string, unknown>) => Promise<unknown>
}

/**
 * The access decision for one already-authenticated account.
 *
 * Split out of `resolveAppViewer` for the `/api/app` routes that are open to
 * ANY account inside Cecilija rather than to one permission (#496's inbox
 * routes): they authenticate with the request's own headers rather than with
 * `next/headers`, and must reach exactly the same verdict as the page gate.
 * Two copies of "who is this dancer" is precisely how a route and a page drift.
 */
export async function resolveAppAccessFor(
  payload: ViewerPayload,
  user: { id: string | number; permissions?: unknown },
): Promise<{
  access: AppAccess
  memberLinkId: string | null
  accountName: string | null
  email: string | null
  hasOwnPassword: boolean
  username: string | null
  shared: boolean
}> {
  // Re-read both links and the Member row itself: see the header note.
  let memberDoc: Record<string, unknown> | null = null
  let memberLinkId: string | null = null
  let partnerId: string | null = null
  // The account's chosen bar (#563). Read from the ROW rather than from the
  // session for the same reason the two links are: a set chosen after a login
  // was issued must reach that phone on its next request, not on its next
  // sign-in.
  let tabs: unknown = null
  let accountName: string | null = null
  let email: string | null = null
  let hasOwnPassword = false
  let username: string | null = null
  let shared = false
  try {
    const account = await payload.findByID({
      collection: 'users',
      id: user.id,
      depth: 0,
      overrideAccess: true,
    })
    const row = account as Record<string, unknown> | null
    const memberId = relationId(row?.member)
    memberLinkId = memberId == null ? null : String(memberId)
    const partner = relationId(row?.partner)
    partnerId = partner == null ? null : String(partner)
    tabs = row?.tabs ?? null
    accountName = typeof row?.name === 'string' && row.name.trim() !== '' ? row.name.trim() : null
    email = typeof row?.email === 'string' && row.email.trim() !== '' ? row.email.trim() : null
    // A stamp, never a hash: the column is set only where a person types a
    // password of their own, and cleared by "Resetiraj lozinku" (ADR-0028).
    hasOwnPassword = row?.passwordSetAt != null
    username =
      typeof row?.username === 'string' && row.username.trim() !== '' ? row.username.trim() : null
    shared = row?.shared === true
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
    access: decideAppAccess(user, toAppMember(memberDoc), { partnerId, tabs }),
    memberLinkId,
    accountName,
    email,
    hasOwnPassword,
    username,
    shared,
  }
}

/**
 * Who is asking, once per request (#593).
 *
 * Wrapped in React's `cache` because the shell moved into a layout: the layout
 * needs the navigation and every page below it needs the same viewer for its
 * gate, and without this the two would each run `payload.auth()` plus two
 * `findByID`s on every single navigation. `cache` is per-request and per-render,
 * so the layout and its page share one resolution and two requests never do.
 */
export const resolveAppViewer = cache(resolveAppViewerUncached)

async function resolveAppViewerUncached(): Promise<AppViewer> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return DENIED

  const { access, memberLinkId, accountName, email, hasOwnPassword, username, shared } =
    await resolveAppAccessFor(payload as unknown as ViewerPayload, user)

  return {
    signedIn: true,
    userId: String(user.id),
    access,
    memberLinkId,
    me: access.kind === 'ok' ? access.self : null,
    accountName,
    email,
    hasOwnPassword,
    username,
    shared,
    nav: access.kind === 'ok' ? access.nav : DENIED.nav,
    permissions: permissionsOf(user as { permissions?: unknown }),
    voditelj: can(user as { permissions?: unknown }, 'moreska'),
    // The bell's number, read once per request alongside everything else the
    // chrome needs (#496). Per ACCOUNT, so the phone and the laptop agree.
    // A failure here is a zero, never a 500: the inbox is the least important
    // thing on any screen it appears on.
    unreadNotifications:
      access.kind === 'ok' ? await unreadCountOrZero(payload, user.id) : 0,
  }
}

async function unreadCountOrZero(payload: unknown, userId: string | number): Promise<number> {
  try {
    return await unreadNotificationCount(poolQuery(payload), userId)
  } catch (err) {
    console.error('[app] unread notification count failed', err)
    return 0
  }
}
