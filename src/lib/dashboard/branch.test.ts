import { describe, it, expect } from 'vitest'
import { dashboardBranchFor } from './branch'

// One fixture per migration bundle (#393): the sets real accounts carry after
// the migration onto permissions.
const developer = {
  permissions: ['users', 'tickets', 'refunds', 'door', 'partner', 'season_stats', 'moreska', 'moreskant', 'dev'],
}
const ticketAdmin = { permissions: ['tickets', 'refunds', 'door'] }
const doorAccount = { permissions: ['door'] }
const partnerAccount = { permissions: ['partner'], partner: 7 }
const partnerNoLink = { permissions: ['partner'] }
const memberAccount = { permissions: ['season_stats'] }
const voditelj = { permissions: ['moreska'] }
const empty = { permissions: [] }

describe('dashboardBranchFor', () => {
  it('sends a partner login to the partner dashboard, linked or not', () => {
    expect(dashboardBranchFor(partnerAccount)).toBe('partner')
    // A misconfigured partner still lands on the partner branch; the "not
    // linked yet" notice is rendered there, never org data.
    expect(dashboardBranchFor(partnerNoLink)).toBe('partner')
  })

  it('sends the shared member login to the season dashboard', () => {
    expect(dashboardBranchFor(memberAccount)).toBe('season_stats')
  })

  it('sends a door-only account to the door dashboard', () => {
    expect(dashboardBranchFor(doorAccount)).toBe('door')
  })

  it('sends a ticket admin to the backoffice dashboard even though she also scans', () => {
    // Tatjana holds `door` so she can work the gate; she must still land on the
    // full secretary dashboard, not the door view.
    expect(dashboardBranchFor(ticketAdmin)).toBe('tickets')
  })

  it('sends the all-permissions developer to the backoffice dashboard', () => {
    // `partner` and `season_stats` are in his set too; `tickets` still wins.
    expect(dashboardBranchFor(developer)).toBe('tickets')
  })

  it('gives an account with no dashboard permission `none`', () => {
    expect(dashboardBranchFor(voditelj)).toBe('none')
    expect(dashboardBranchFor(empty)).toBe('none')
    expect(dashboardBranchFor(null)).toBe('none')
    expect(dashboardBranchFor(undefined)).toBe('none')
  })

  it('ignores a permission outside the vocabulary', () => {
    expect(dashboardBranchFor({ permissions: ['admin-tier', 'superadmin'] })).toBe('none')
  })

  it('gives a session with no permission set at all no branch', () => {
    expect(dashboardBranchFor({} as never)).toBe('none')
  })

  // #500: `finance` is money without buyers. Until the Financije screen ships
  // in Cecilija, its holder gets the read-only counts view, and it outranks
  // `door` so the president does not land on the door dashboard.
  it('sends a finance holder to the counts view', () => {
    expect(dashboardBranchFor({ permissions: ['finance'] })).toBe('season_stats')
  })

  it('sends Velebit, who holds finance and door, to the counts view', () => {
    expect(dashboardBranchFor({ permissions: ['finance', 'door'] })).toBe('season_stats')
  })

  it('still sends the secretary to the backoffice when she also holds finance', () => {
    expect(dashboardBranchFor({ permissions: ['tickets', 'refunds', 'door', 'finance'] })).toBe(
      'tickets',
    )
  })

  // An `editor` needs a branch of its own: `none` redirects to the login page,
  // and Payload's login view redirects a signed-in user straight back, so a
  // content editor with no branch would bounce between the two forever.
  it('sends an editor-only account to the content landing', () => {
    expect(dashboardBranchFor({ permissions: ['editor'] })).toBe('editor')
  })

  it('still sends the secretary to the backoffice when she also holds editor', () => {
    expect(dashboardBranchFor({ permissions: ['tickets', 'editor'] })).toBe('tickets')
  })

  it('sends an editor who also works the door to the door dashboard', () => {
    expect(dashboardBranchFor({ permissions: ['door', 'editor'] })).toBe('door')
  })
})
