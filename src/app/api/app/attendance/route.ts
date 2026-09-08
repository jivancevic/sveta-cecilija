import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { resolveOwnMemberId, type MemberLinkReader } from '@/lib/access/attendance-access'
import { handleAttendanceAnswer, type ExistingAnswer } from '@/lib/attendance/answer'
import type { Army, AttendanceMember, AttendancePerformance } from '@/lib/attendance/rules'
import { showStartMs } from '@/lib/show-time'

// POST /api/app/attendance — the ONE writer of an attendance row (#422).
//
// Wiring only: the rules live in `src/lib/attendance/rules.ts` and the status
// codes and upsert in `src/lib/attendance/answer.ts`, both unit-tested through
// injected deps. What this file adds is the two things a pure function cannot
// do — the permission gate and the Payload calls.
//
// `requirePermission([...])` is the chokepoint every staff route uses (CLAUDE.md
// hard rule): the local API runs `overrideAccess: true`, so the collection
// access on `attendance` does NOT gate this handler. It answers 401 for an
// anonymous caller and 403 for a `tickets`, `door` or `partner` login; the rules
// then decide whether this particular moreškant may answer for this particular
// member on this particular evening.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function army(value: unknown): Army | null {
  return value === 'crni' || value === 'bili' ? value : null
}

export async function POST(req: Request) {
  const gate = await requirePermission(req, ['moreskant', 'moreska'])
  if (gate.error) return gate.error
  const { payload, user } = gate

  // `Users.member` is field-locked to `users` (#420), so the session carries no
  // link: re-read it, exactly as /app's viewer does.
  const ownMemberId = await resolveOwnMemberId(
    payload as unknown as MemberLinkReader,
    user as { id?: string | number; member?: unknown },
  )

  const body = await req.json().catch(() => null)

  const result = await handleAttendanceAnswer(body, {
    actor: { user: user as { permissions?: unknown }, memberId: ownMemberId == null ? null : String(ownMemberId) },

    loadPerformance: async (id): Promise<AttendancePerformance | null> => {
      try {
        const doc = (await payload.findByID({
          collection: 'shows',
          id,
          depth: 0,
          overrideAccess: true,
        })) as unknown as Record<string, unknown> | null
        if (!doc) return null
        const date = String(doc.date ?? '').slice(0, 10)
        const time = typeof doc.time === 'string' ? doc.time : ''
        return {
          id: String(doc.id),
          startMs: date && time ? showStartMs(date, time) : Number.NaN,
          cancelled: doc.status === 'cancelled',
        }
      } catch {
        return null
      }
    },

    loadMember: async (id): Promise<AttendanceMember | null> => {
      try {
        const doc = (await payload.findByID({
          collection: 'members',
          id,
          depth: 0,
          overrideAccess: true,
        })) as unknown as Record<string, unknown> | null
        if (!doc) return null
        return {
          id: String(doc.id),
          name: typeof doc.name === 'string' ? doc.name : null,
          nickname: typeof doc.nickname === 'string' ? doc.nickname : null,
          roles: Array.isArray(doc.roles) ? (doc.roles as string[]) : [],
          primaryRole: typeof doc.primaryRole === 'string' ? doc.primaryRole : null,
          active: doc.active !== false,
          isMoreskant: doc.isMoreskant === true,
        }
      } catch {
        return null
      }
    },

    findExisting: async (performanceId, memberId): Promise<ExistingAnswer | null> => {
      const found = await payload.find({
        collection: 'attendance',
        where: {
          and: [{ performance: { equals: performanceId } }, { member: { equals: memberId } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const row = found.docs[0] as unknown as Record<string, unknown> | undefined
      return row ? { id: row.id as string | number, army: army(row.army) } : null
    },

    create: (row) =>
      payload.create({
        collection: 'attendance',
        data: row as never,
        overrideAccess: true,
      }),

    update: (id, row) =>
      payload.update({
        collection: 'attendance',
        id,
        data: row as never,
        overrideAccess: true,
      }),

    remove: (id) =>
      payload.delete({
        collection: 'attendance',
        id,
        overrideAccess: true,
      }),
  })

  return NextResponse.json(result.body, { status: result.status })
}
