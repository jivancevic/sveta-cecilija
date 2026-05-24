import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { addInPersonSales } from '@/lib/in-person-sales'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: req.headers })
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const rawCount = body?.count
  if (typeof rawCount !== 'number' || !Number.isInteger(rawCount) || rawCount <= 0) {
    return NextResponse.json({ error: 'count must be a positive integer' }, { status: 400 })
  }
  const count = rawCount

  try {
    const result = await addInPersonSales(
      { showId: id, count },
      {
        atomicIncrement: async (showId, delta) => {
          // Single SQL statement — postgres serialises concurrent writes to
          // the same row, so two parallel adds cannot lose updates.
          // The payload-postgres adapter exposes its pool at `payload.db.pool`.
          const db = (payload.db as unknown as { pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: { in_person_sold: number }[] }> } }).pool
          const res = await db.query(
            'UPDATE shows SET in_person_sold = COALESCE(in_person_sold, 0) + $1, updated_at = NOW() WHERE id = $2 RETURNING in_person_sold',
            [delta, Number(showId)],
          )
          if (res.rows.length === 0) return null
          return { inPersonSold: Number(res.rows[0].in_person_sold) }
        },
      },
    )
    return NextResponse.json({ inPersonSold: result.inPersonSold })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add in-person sales'
    const status = /not found/i.test(message) ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
