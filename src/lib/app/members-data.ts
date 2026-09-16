import { getRepo } from '@/lib/repo'
import { MemberHookError } from '@/lib/repo/members'
import type { WriteCtx } from '@/lib/repo/auth'
import { memberAccess, type MemberAccess } from './member-marks'
import type { MemberSaveOutcome } from './members-edit'
import type { MemberRosterRow } from './members-screen'

// The IO wiring behind Članovi (#511) — the `inquiries-data.ts` shape: the seam
// calls and nothing else, so WHO is on the list and WHAT may be written stay in
// the pure, unit-tested `members-screen.ts` and `members-edit.ts`.
//
// This module is also what retired three allow-list entries in
// `repo-guard.test.ts` (#511): the invitation list, the rehearsal join code's
// roster read and the self-link list each ran their own `payload.find` for the
// same two questions — "who is a moreškant" and "who already has a login" — and
// all three now ask `repo.members`.

/** The roster and the login set, in one round trip: the list needs both. */
export async function loadRoster(): Promise<{
  members: MemberRosterRow[]
  idsWithLogin: Set<string>
}> {
  const repo = getRepo()
  const [members, idsWithLogin] = await Promise.all([
    repo.members.listMoreskanti(),
    repo.members.idsWithLogin(),
  ])
  return { members, idsWithLogin }
}

/**
 * The three marks for every dancer, by Member id (#653).
 *
 * **Null on failure, never an empty map.** An empty map would say "nije ušao"
 * about seventy-six people, which is a lie a voditelj would act on; null draws
 * no marks and no chips at all, which is the truth. The roster itself is not
 * taken down over a statistic, the way the bell's count is not.
 */
export async function loadMemberAccess(): Promise<Record<string, MemberAccess> | null> {
  try {
    const signals = await getRepo().members.accountSignals()
    const access: Record<string, MemberAccess> = {}
    for (const [memberId, signal] of signals) access[memberId] = memberAccess(signal)
    return access
  } catch (err) {
    console.error('[app] roster access signals failed', err)
    return null
  }
}

/** One dancer's profile, or null. The screen 404s on null. */
export function loadMember(id: string): Promise<MemberRosterRow | null> {
  return getRepo().members.byId(id)
}

/**
 * Write a profile patch, turning the collection hook's refusal into an outcome.
 *
 * The hook is the only writer that can see the other rows, so it is where
 * nickname uniqueness is decided; `MemberHookError` is that decision on its way
 * back, and everything else stays a throw and becomes a 500.
 */
export async function saveMember(
  id: string,
  patch: Record<string, unknown>,
  ctx: WriteCtx,
): Promise<MemberSaveOutcome> {
  try {
    return { ok: true, member: await getRepo().members.update(id, patch, ctx) }
  } catch (err) {
    if (err instanceof MemberHookError) return { ok: false, message: err.message }
    throw err
  }
}

/** Add a dancer by hand. Same hook, same refusals, same outcome shape. */
export async function createMember(
  input: Record<string, unknown>,
  ctx: WriteCtx,
): Promise<MemberSaveOutcome> {
  try {
    return {
      ok: true,
      member: await getRepo().members.createMoreskant(
        input as unknown as Parameters<ReturnType<typeof getRepo>['members']['createMoreskant']>[0],
        ctx,
      ),
    }
  } catch (err) {
    if (err instanceof MemberHookError) return { ok: false, message: err.message }
    throw err
  }
}
