export type Role = 'superadmin' | 'admin' | 'tehnika'

export type RoleUser = { role?: Role | string } | null | undefined

export function isSuperadmin(user: RoleUser): boolean {
  return !!user && (user as { role?: string }).role === 'superadmin'
}

export function isAdminTier(user: RoleUser): boolean {
  const role = user && (user as { role?: string }).role
  return role === 'superadmin' || role === 'admin'
}

export function isAuthed(user: RoleUser): boolean {
  const role = user && (user as { role?: string }).role
  return role === 'superadmin' || role === 'admin' || role === 'tehnika'
}
