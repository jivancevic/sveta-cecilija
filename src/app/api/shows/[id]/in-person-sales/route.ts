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
  const count = Number(body?.count)

  try {
    const result = await addInPersonSales(
      { showId: id, count },
      {
        findShow: async (showId) => {
          const show = await payload.findByID({ collection: 'shows', id: showId, depth: 0 })
          if (!show) return null
          return {
            id: String(show.id),
            onlineSold: Number(show.onlineSold ?? 0),
            inPersonSold: Number(show.inPersonSold ?? 0),
          }
        },
        updateShow: async (showId, data) => {
          await payload.update({ collection: 'shows', id: showId, data })
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
