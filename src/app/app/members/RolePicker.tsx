'use client'

import { DANCE_ROLES, DANCE_ROLE_LABELS, type DanceRole } from '@/lib/moreskant-profile'
import { APP_STRINGS } from '@/lib/app/strings'

// The dance roles, as a voditelj picks them (#511).
//
// Six checkboxes and a select, not a multi-select: on a phone a native
// multi-select is a scroll wheel nobody finds the second item in, and six is
// few enough to show at once. The order is the vocabulary's own
// (`DANCE_ROLES`), so "crni, bili, then the special ones" reads the way a
// voditelj lists them.
//
// It validates nothing. Every rule — at least one role, a primary role among
// them, a king needing his army — is `validateAndNormaliseMoreskant`, run by
// the route and again by the collection hook, and re-implementing any of it
// here is exactly the drift that function exists to prevent. What the picker
// does do is keep the primary select honest: it only offers roles that are
// actually ticked, so the commonest way to break the rule is not reachable.

export function RolePicker({
  roles,
  primaryRole,
  onChange,
  disabled,
}: {
  roles: string[]
  primaryRole: string
  onChange: (next: { roles: string[]; primaryRole: string }) => void
  disabled?: boolean
}) {
  function toggle(role: DanceRole, on: boolean) {
    const next = on ? [...new Set([...roles, role])] : roles.filter((r) => r !== role)
    // Un-ticking the primary role leaves the select pointing at nothing, so it
    // falls back to the first role still held rather than to an invalid value.
    const primary = next.includes(primaryRole) ? primaryRole : (next[0] ?? '')
    onChange({ roles: next, primaryRole: primary })
  }

  return (
    <>
      <fieldset className="app__roles">
        <legend>{APP_STRINGS.members.roles}</legend>
        {DANCE_ROLES.map((role) => (
          <label key={role} className="app__role">
            <input
              type="checkbox"
              checked={roles.includes(role)}
              disabled={disabled}
              onChange={(e) => toggle(role, e.target.checked)}
            />
            <span>{DANCE_ROLE_LABELS[role]}</span>
          </label>
        ))}
      </fieldset>

      <label className="app__field">
        <span>{APP_STRINGS.members.primaryRole}</span>
        <select
          value={primaryRole}
          disabled={disabled || roles.length === 0}
          onChange={(e) => onChange({ roles, primaryRole: e.target.value })}
        >
          <option value="">{APP_STRINGS.header.noRoles}</option>
          {DANCE_ROLES.filter((r) => roles.includes(r)).map((role) => (
            <option key={role} value={role}>
              {DANCE_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
