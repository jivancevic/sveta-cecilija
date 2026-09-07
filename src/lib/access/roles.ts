export type Role = 'superadmin' | 'admin' | 'tehnika' | 'partner' | 'member'

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

// The shared, read-only society-membership login (ADR-0022). Deliberately in NO
// other predicate: `member` is not internal staff (isAuthed), not admin tier,
// not a reseller. It reaches its own dashboard branch and nothing else — every
// collection's access and `admin.hidden` is an allow-list, so a role that
// appears in none of them defaults to denied, which is the safe direction.
export function isMember(user: RoleUser): boolean {
  return !!user && (user as { role?: string }).role === 'member'
}

// `partnerIdOf` reads the Partners *link*, not the role, so it survives the
// permission migration (ADR-0023) and now lives with the rest of the partner
// scoping in ./partner. Re-exported here so the remaining role-shaped call
// sites keep compiling until #397 deletes this module.
export { partnerIdOf } from './partner'
