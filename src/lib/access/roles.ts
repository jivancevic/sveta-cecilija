export type Role = 'superadmin' | 'admin' | 'tehnika' | 'partner'

export type RoleUser = { role?: Role | string } | null | undefined

export function isSuperadmin(user: RoleUser): boolean {
  return !!user && (user as { role?: string }).role === 'superadmin'
}

export function isAdminTier(user: RoleUser): boolean {
  const role = user && (user as { role?: string }).role
  return role === 'superadmin' || role === 'admin'
}

// Staff who operate the org's own /admin. Deliberately excludes `partner`:
// a reseller login is authenticated but is NOT internal staff, so it must
// never fall into the door-scan / org-stats read paths gated on this.
export function isAuthed(user: RoleUser): boolean {
  const role = user && (user as { role?: string }).role
  return role === 'superadmin' || role === 'admin' || role === 'tehnika'
}

export function isPartner(user: RoleUser): boolean {
  return !!user && (user as { role?: string }).role === 'partner'
}

// The `partners` record a `partner`-role login is bound to. The link is the
// `partner` relationship on the Users collection; Payload returns it on
// `req.user` as a bare id (depth 0) or a populated doc. Returns undefined when
// unset (a misconfigured partner login with no linked record) — callers MUST
// treat that as "owns nothing", never as "owns everything".
export function partnerIdOf(user: RoleUser): number | string | undefined {
  const link = (user as { partner?: unknown } | null | undefined)?.partner
  if (link == null) return undefined
  if (typeof link === 'object') {
    const id = (link as { id?: number | string }).id
    return id == null ? undefined : id
  }
  return link as number | string
}
