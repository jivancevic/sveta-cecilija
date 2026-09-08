// The five MCP tools, as pure functions over a DI'd store (#438, ADR-0024).
//
// A voditelj photographs the paper list on the pier, Claude reads it in the
// chat and calls `set_lineup` with nicknames. That is the whole reason this
// server exists, and it dictates the shape of everything here:
//
//  - **Tools take structured text, never an image** (ADR-0024). The model does
//    the reading; the server does the matching, and only exact matching.
//  - **`set_lineup` never guesses.** A nickname it cannot match EXACTLY (after
//    lowercasing and stripping diacritics) comes back in `unmatched` rather
//    than being resolved to the nearest dancer, because a mis-read photo has to
//    produce a question, not a wrong record (#430, story 61).
//  - **Nothing here has consequences a voditelj cannot see coming.** There is no
//    tool that confirms a lineup, sends an alarm, answers attendance or issues a
//    comp (story 63). Those stay taps in the app.
//  - **What is written is always UNCONFIRMED** (story 62): confirming stays a
//    deliberate tap on the phone, and `replaceLineup` refuses outright once the
//    evening is locked.
//
// Everything is pure over {@link McpStore}, so the whole tool surface is
// unit-tested with a fake store and the route is only wiring. The store's
// Payload half lives in `store.ts`.

import { countArmies, type AttendanceRow } from '@/lib/attendance/army-count'
import type { AttendanceMember } from '@/lib/attendance/rules'
import { normaliseNickname } from '@/lib/app/username'
import { compareLineupRows, type LineupEntry } from '@/lib/lineup/rules'
import { roleWarnings } from '@/lib/lineup/rules'
import type { LineupWriteOutcome } from '@/lib/lineup/write-tx'
import {
  DANCE_ROLES,
  DANCE_ROLE_LABELS,
  isDanceRole,
  type DanceRole,
} from '@/lib/moreskant-profile'
import {
  PERFORMANCE_KINDS,
  PerformanceValidationError,
  validateAndNormalisePerformance,
  type PerformanceKind,
} from '@/lib/show-performance'
import { seasonYear } from '@/lib/member/season'

// --- what the tools speak ---

/** One performance, as an MCP client sees it. No sales, no buyer data. */
export interface McpPerformance {
  id: string
  /** `YYYY-MM-DD`. */
  date: string
  /** `HH:MM`, Europe/Zagreb wall clock. */
  time: string
  kind: string
  isPublic: boolean
  /** The venue label or the free-text location (`performance-place.ts`). */
  place: string
  cancelled: boolean
  note: string | null
  lineupConfirmed: boolean
  thresholdCrni: number
  thresholdBili: number
}

/** One moreškant, as an MCP client sees them. Mobiles and emails are absent. */
export interface McpMoreskant {
  id: string
  nickname: string
  name: string | null
  active: boolean
  roles: string[]
  primaryRole: string | null
  /** Whether a login exists for this dancer; never the username or the email. */
  hasLogin: boolean
}

/** An attendance row with the performance it belongs to, for the batch read. */
export interface McpAttendanceRow extends AttendanceRow {
  performanceId: string
}

export interface McpLineupRow {
  memberId: string
  role: DanceRole
}

export interface McpNewPerformance {
  date?: unknown
  time?: unknown
  kind?: unknown
  location?: unknown
  client?: unknown
  note?: unknown
}

export interface McpStore {
  /** Every performance of the season, public and non-public alike. */
  listPerformances: (season: number) => Promise<McpPerformance[]>
  getPerformance: (id: string) => Promise<McpPerformance | null>
  /** Every ACTIVE moreškant, the set the army count and the matching run over. */
  loadRoster: () => Promise<AttendanceMember[]>
  /** The whole roster including retired dancers, for `list_moreskanti`. */
  listMoreskanti: () => Promise<McpMoreskant[]>
  /** The answers of these performances, in one query. */
  attendanceRows: (performanceIds: readonly string[]) => Promise<McpAttendanceRow[]>
  lineupFor: (performanceId: string) => Promise<McpLineupRow[]>
  /** `replaceLineupInTransaction` — the same writer `POST /api/app/lineup` uses. */
  replaceLineup: (
    performanceId: string,
    entries: readonly LineupEntry[],
  ) => Promise<LineupWriteOutcome>
  /** `createPerformancesInBulk` — the same writer `/api/shows/bulk-create` uses. */
  createPerformances: (
    rows: { dateStr: string; data: Record<string, unknown> }[],
  ) => Promise<{ created: string[] }>
}

/** Every tool answers with one of these; the route serialises it as JSON text. */
export type ToolResult<T> = ({ ok: true } & T) | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

// --- list_performances ---

export interface McpPerformanceSummary extends McpPerformance {
  /** "Coming" headcounts, the same single home the app and the alarm use. */
  armies: { crni: number; bili: number; noAnswer: number }
}

/**
 * `list_performances({ season })` — the season's evenings with their headcounts.
 *
 * The season defaults to the current calendar year (ADR-0022, `seasonYear`),
 * and a season nobody danced is an empty list rather than an error: "there is
 * nothing there" is an answer.
 */
export async function listPerformances(
  args: { season?: unknown },
  store: McpStore,
  now: () => Date = () => new Date(),
): Promise<ToolResult<{ season: number; performances: McpPerformanceSummary[] }>> {
  const season = toSeason(args.season, now)
  if (season === null) return fail('Sezona mora biti godina, na primjer 2026.')

  const performances = await store.listPerformances(season)
  if (performances.length === 0) return { ok: true, season, performances: [] }

  const [roster, rows] = await Promise.all([
    store.loadRoster(),
    store.attendanceRows(performances.map((p) => p.id)),
  ])

  const byPerformance = new Map<string, AttendanceRow[]>()
  for (const row of rows) {
    const list = byPerformance.get(row.performanceId)
    if (list) list.push(row)
    else byPerformance.set(row.performanceId, [row])
  }

  return {
    ok: true,
    season,
    performances: performances.map((p) => {
      const count = countArmies(byPerformance.get(p.id) ?? [], roster, {
        crni: p.thresholdCrni,
        bili: p.thresholdBili,
      })
      return {
        ...p,
        armies: {
          crni: count.crni.count,
          bili: count.bili.count,
          noAnswer: count.noAnswer.length,
        },
      }
    }),
  }
}

/** A season argument: absent means this year; anything unparseable is a refusal. */
function toSeason(value: unknown, now: () => Date): number | null {
  if (value == null || value === '') return seasonYear(now())
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(n) || n < 1883 || n > 2200) return null
  return n
}

// --- get_performance ---

export interface McpPerformanceDetail {
  performance: McpPerformance
  attendance: {
    nickname: string
    memberId: string
    status: 'coming' | 'not_coming'
    army: 'crni' | 'bili' | null
  }[]
  noAnswer: string[]
  lineup: {
    confirmed: boolean
    entries: { memberId: string; nickname: string; role: DanceRole; roleLabel: string }[]
  }
}

/**
 * `get_performance({ id })` — one evening with its answers and its postava.
 *
 * The lineup is returned in the reading order the app uses
 * (`compareLineupRows`: kings first, then the armies), so a voditelj dictating
 * a correction hears the list back in the order the paper one is written in.
 */
export async function getPerformance(
  args: { id?: unknown },
  store: McpStore,
): Promise<ToolResult<McpPerformanceDetail>> {
  const id = idOf(args.id)
  if (!id) return fail('Treba id izvedbe.')

  const performance = await store.getPerformance(id)
  if (!performance) return fail(`Izvedba ${id} ne postoji.`)

  const [roster, rows, lineup] = await Promise.all([
    store.loadRoster(),
    store.attendanceRows([id]),
    store.lineupFor(id),
  ])

  const byId = new Map(roster.map((m) => [String(m.id), m]))
  const nicknameOf = (memberId: string) =>
    byId.get(String(memberId))?.nickname?.trim() || `#${memberId}`

  const attendance = rows
    .filter((r) => byId.has(String(r.memberId)))
    .map((r) => ({
      memberId: String(r.memberId),
      nickname: nicknameOf(String(r.memberId)),
      status: r.status,
      army: r.army ?? null,
    }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, 'hr'))

  const answered = new Set(rows.map((r) => String(r.memberId)))
  const noAnswer = roster
    .filter((m) => !answered.has(String(m.id)))
    .map((m) => m.nickname?.trim() || `#${m.id}`)
    .sort((a, b) => a.localeCompare(b, 'hr'))

  const entries = lineup
    .map((row) => ({
      memberId: String(row.memberId),
      nickname: nicknameOf(String(row.memberId)),
      role: row.role,
      roleLabel: DANCE_ROLE_LABELS[row.role],
    }))
    .sort(compareLineupRows)

  return {
    ok: true,
    performance,
    attendance,
    noAnswer,
    lineup: { confirmed: performance.lineupConfirmed, entries },
  }
}

// --- list_moreskanti ---

/**
 * `list_moreskanti()` — the roster, so Claude knows which nicknames exist.
 *
 * Mobiles and e-mails are absent by construction, not by filtering downstream:
 * ADR-0024's PII boundary is a property of the data contract, and a tool that
 * answers into a chat window is the last place to relax it.
 */
export async function listMoreskanti(
  store: McpStore,
): Promise<ToolResult<{ moreskanti: McpMoreskant[] }>> {
  const moreskanti = await store.listMoreskanti()
  return {
    ok: true,
    moreskanti: [...moreskanti].sort((a, b) => a.nickname.localeCompare(b.nickname, 'hr')),
  }
}

// --- set_lineup ---

/**
 * The match key for a nickname: lowercase, diacritics transliterated the
 * Croatian way, everything else reduced to a dash.
 *
 * It is `normaliseNickname` (#424's normaliser, split out in the #445 review)
 * rather than a second implementation, because that function already answers
 * "what is this nickname when it has to go ASCII", it is exhaustively
 * table-tested, and a copy would be one more place for `Đuro` to become `uro`.
 * "Ćići", "cici" and " CICI " are one key.
 *
 * It is deliberately NOT `usernameFromNickname`, which falls back to the word
 * `moreskant` for a nickname that reduces to nothing: a login needs an
 * identifier, a match key must not invent one, or every symbol-only name would
 * match the same dancer. An empty key never matches anything.
 */
export function nicknameMatchKey(nickname: unknown): string {
  return normaliseNickname(typeof nickname === 'string' ? nickname : '')
}

export interface SetLineupResult {
  written: { nickname: string; role: DanceRole; roleLabel: string }[]
  /** Names no active moreškant answers to. Reported, never guessed at. */
  unmatched: string[]
  /**
   * Names that match MORE THAN ONE active moreškant once normalised — "Ćići"
   * and "Cici" both on the roster. Nothing is written for them, exactly as for
   * an unmatched name: picking either dancer would be a guess, and picking the
   * last one found would make the answer depend on the roster's sort order.
   */
  ambiguous: string[]
  /** Roles outside a dancer's profile, duplicates dropped: saved anyway. */
  warnings: string[]
}

/**
 * `set_lineup({ performanceId, entries })` — record who danced what.
 *
 * The refusals are whole-call, because each of them means the request itself is
 * wrong: an unknown performance, an unknown ROLE (Claude picked a word outside
 * the vocabulary), a confirmed evening (409's sentence: press Otključaj first),
 * and a list where nothing at all matched (writing an empty postava over a real
 * one because the photo was unreadable is the worst outcome available).
 *
 * Everything else is a partial write plus a report: matched dancers are written
 * UNCONFIRMED, unmatched names come back verbatim, and a role the dancer's
 * profile does not list is a warning that still saves (story 29, the same rule
 * the editor shows).
 */
export async function setLineup(
  args: { performanceId?: unknown; entries?: unknown },
  store: McpStore,
): Promise<ToolResult<SetLineupResult>> {
  const performanceId = idOf(args.performanceId)
  if (!performanceId) return fail('Treba id izvedbe.')
  if (!Array.isArray(args.entries) || args.entries.length === 0) {
    return fail('Treba popis parova nadimak + uloga.')
  }

  const performance = await store.getPerformance(performanceId)
  if (!performance) return fail(`Izvedba ${performanceId} ne postoji.`)
  if (performance.lineupConfirmed) {
    return fail('Postava je potvrđena. Otključaj je u aplikaciji pa pokušaj ponovno.')
  }

  const roster = await store.loadRoster()
  // A key that two active dancers share resolves to NOBODY rather than to
  // whichever of them the roster happened to list last (#445 review). The
  // nickname uniqueness rule is case-insensitive on the raw value (#420), so
  // "Ćići" and "Cici" can both be on the roster and still collide here.
  const byKey = new Map<string, AttendanceMember | 'ambiguous'>()
  for (const member of roster) {
    const key = nicknameMatchKey(member.nickname)
    if (!key) continue
    byKey.set(key, byKey.has(key) ? 'ambiguous' : member)
  }

  const entries: LineupEntry[] = []
  const written: SetLineupResult['written'] = []
  const unmatched: string[] = []
  const ambiguous: string[] = []
  const warnings: string[] = []
  const seen = new Set<string>()

  for (const raw of args.entries) {
    const item = (raw ?? {}) as { nickname?: unknown; role?: unknown }
    const nickname = typeof item.nickname === 'string' ? item.nickname.trim() : ''
    if (!nickname) return fail('Svaki redak treba nadimak.')
    if (!isDanceRole(item.role)) {
      return fail(
        `Nepoznata plesna uloga "${String(item.role)}". Dopuštene su: ${DANCE_ROLES.join(', ')}.`,
      )
    }

    const member = byKey.get(nicknameMatchKey(nickname))
    if (member === 'ambiguous') {
      ambiguous.push(nickname)
      continue
    }
    if (!member) {
      unmatched.push(nickname)
      continue
    }
    const memberId = String(member.id)
    if (seen.has(memberId)) {
      // One role per dancer per evening (story 30). The first mention wins and
      // the second is reported rather than silently overwriting it.
      warnings.push(`${nickname} je naveden dva puta; uzeta je prva uloga.`)
      continue
    }
    seen.add(memberId)
    entries.push({ memberId, role: item.role })
    written.push({
      nickname: member.nickname?.trim() || nickname,
      role: item.role,
      roleLabel: DANCE_ROLE_LABELS[item.role],
    })
  }

  if (entries.length === 0) {
    const named = [...unmatched, ...ambiguous].join(', ')
    return fail(`Nijedan nadimak nije prepoznat (${named}). Postava nije promijenjena.`)
  }

  const outcome = await store.replaceLineup(performanceId, entries)
  if (!outcome.written) {
    return fail(
      outcome.reason === 'confirmed'
        ? 'Postava je u međuvremenu potvrđena. Otključaj je u aplikaciji pa pokušaj ponovno.'
        : `Izvedba ${performanceId} ne postoji.`,
    )
  }

  for (const w of roleWarnings(entries, roster)) warnings.push(w.message)

  return { ok: true, written, unmatched, ambiguous, warnings }
}

// --- create_performances ---

export interface CreatePerformancesResult {
  created: string[]
  /** Rows that were refused, by their index in the request. */
  rejected: { index: number; error: string }[]
}

/** The kinds this tool may create: never `redovna`, which sells tickets. */
export const MCP_CREATABLE_KINDS = PERFORMANCE_KINDS.filter(
  (k): k is Exclude<PerformanceKind, 'redovna'> => k !== 'redovna',
)

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * True only for a date that exists in the calendar.
 *
 * The shape test is not enough (#445 review): `2026-02-31` matches the regex
 * and `new Date()` happily rolls it forward to 3 March, so a mistyped ship call
 * would land in the roster on a day nobody wrote down. The round trip through
 * `Date.UTC` is what catches it — a rolled-over date no longer prints as the
 * string it came from. It also rejects month 00/13 and day 00 for free.
 */
export function isRealCalendarDay(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(mo) - 1 &&
    date.getUTCDate() === Number(d)
  )
}

/**
 * `create_performances({ rows })` — next year's cruise calls in one paste.
 *
 * **It cannot create a `redovna`.** A Redovna is a public performance: it needs
 * a venue, it sells tickets, it appears on `/tickets`, and the backoffice
 * creates a season of them from a date range in `/admin`. A tool that produced
 * one from a chat message would be one typo away from a ticket on sale for an
 * evening nobody planned, so the kinds are the non-public four and the refusal
 * says where to go instead.
 *
 * The batch is validated FIRST and written only if every row is good: half a
 * pasted calendar is harder to fix than none of it, and the caller gets the
 * whole list of what to correct in one answer.
 */
export async function createPerformances(
  args: { rows?: unknown },
  store: McpStore,
): Promise<ToolResult<CreatePerformancesResult>> {
  if (!Array.isArray(args.rows) || args.rows.length === 0) {
    return fail('Treba popis izvedbi.')
  }

  const rows: { dateStr: string; data: Record<string, unknown> }[] = []
  const rejected: CreatePerformancesResult['rejected'] = []

  args.rows.forEach((raw, index) => {
    const row = (raw ?? {}) as McpNewPerformance
    const date = typeof row.date === 'string' ? row.date.trim() : ''
    const time = typeof row.time === 'string' ? row.time.trim() : ''
    const kind = typeof row.kind === 'string' ? row.kind.trim() : ''

    if (!DATE_RE.test(date)) {
      rejected.push({ index, error: 'Datum mora biti u obliku YYYY-MM-DD.' })
      return
    }
    if (!isRealCalendarDay(date)) {
      rejected.push({ index, error: `Datum ${date} ne postoji u kalendaru.` })
      return
    }
    if (!TIME_RE.test(time)) {
      rejected.push({ index, error: 'Vrijeme mora biti u obliku HH:MM.' })
      return
    }
    if (kind === 'redovna') {
      rejected.push({
        index,
        error: 'Redovnu izvedbu se ne unosi ovdje: ona prodaje karte i unosi se u administraciji.',
      })
      return
    }
    if (!(MCP_CREATABLE_KINDS as readonly string[]).includes(kind)) {
      rejected.push({
        index,
        error: `Nepoznata vrsta "${kind}". Dopuštene su: ${MCP_CREATABLE_KINDS.join(', ')}.`,
      })
      return
    }

    const data: Record<string, unknown> = {
      // Shows are stored at NOON UTC so the UTC calendar day is the intended
      // day whatever the server's offset (db-bootstrap.md, `toIsoDate`).
      date: `${date}T12:00:00.000Z`,
      time,
      kind,
      isPublic: false,
      location: typeof row.location === 'string' ? row.location.trim() : '',
      client: typeof row.client === 'string' && row.client.trim() !== '' ? row.client.trim() : null,
      voditeljNote:
        typeof row.note === 'string' && row.note.trim() !== '' ? row.note.trim() : null,
      status: 'active',
      onlineSold: 0,
      inPersonSold: 0,
    }

    try {
      // The same invariants the collection's beforeValidate hook enforces, run
      // here so a bad row is a sentence in the answer rather than a 500 out of
      // the middle of a batch.
      rows.push({ dateStr: date, data: validateAndNormalisePerformance(data) })
    } catch (err) {
      rejected.push({
        index,
        error:
          err instanceof PerformanceValidationError
            ? err.message
            : 'Izvedba nije prošla provjeru.',
      })
    }
  })

  if (rejected.length > 0) return { ok: true, created: [], rejected }

  const { created } = await store.createPerformances(rows)
  return { ok: true, created, rejected }
}

function idOf(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}
