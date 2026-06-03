import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/access/route-guard'
import { isAdminTier } from '@/lib/access/roles'

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, isAdminTier)
  if (gate.error) return gate.error
  const { payload } = gate

  const body = await req.json()
  const { startDate, endDate, daysOfWeek, time, venue } = body

  if (!startDate || !endDate || !Array.isArray(daysOfWeek) || !daysOfWeek.length || !time || !venue) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (venue !== 'ljetno-kino' && venue !== 'zimsko-kino') {
    return NextResponse.json({ error: 'Invalid venue' }, { status: 400 })
  }

  const start = new Date(startDate)
  const end = new Date(endDate)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }
  if (start > end) {
    return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 })
  }

  // Generate all dates in range that match the selected days of week (0=Sun, 1=Mon, ... 6=Sat)
  const targetDates: Date[] = []
  const cursor = new Date(start)
  cursor.setHours(12, 0, 0, 0) // noon to avoid DST issues
  end.setHours(12, 0, 0, 0)

  while (cursor <= end) {
    if (daysOfWeek.includes(cursor.getDay())) {
      targetDates.push(new Date(cursor))
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  if (targetDates.length === 0) {
    return NextResponse.json({ created: [], skipped: [], message: 'No dates match the selected days in that range' })
  }

  // Fetch existing shows in range to detect duplicates
  const existingShows = await payload.find({
    collection: 'shows',
    where: {
      and: [
        { date: { greater_than_equal: start.toISOString() } },
        { date: { less_than_equal: new Date(endDate + 'T23:59:59Z').toISOString() } },
      ],
    },
    limit: 1000,
  })

  // Normalise existing dates to YYYY-MM-DD for comparison
  const existingDateStrings = new Set(
    existingShows.docs.map((show) => {
      const d = new Date(show.date as string)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }),
  )

  const created: string[] = []
  const skipped: string[] = []

  for (const date of targetDates) {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

    if (existingDateStrings.has(dateStr)) {
      skipped.push(dateStr)
      continue
    }

    await payload.create({
      collection: 'shows',
      data: {
        date: date.toISOString(),
        time,
        venue,
        onlineSold: 0,
        inPersonSold: 0,
        status: 'active',
      },
    })
    created.push(dateStr)
  }

  return NextResponse.json({ created, skipped })
}
