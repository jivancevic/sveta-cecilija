export type Role = 'admin' | 'door-staff'

export type RoleUser = { role?: Role | string } | null | undefined

export function isAdmin(user: RoleUser): boolean {
  return !!user && (user as { role?: string }).role === 'admin'
}

export function isAuthed(user: RoleUser): boolean {
  const role = user && (user as { role?: string }).role
  return role === 'admin' || role === 'door-staff'
}
