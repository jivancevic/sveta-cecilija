'use client'

import { useState } from 'react'
import type { RosterPerformance } from '@/lib/app/roster-loaders'
import { APP_STRINGS, KIND_LABELS, formatPerformanceDate } from '@/lib/app/strings'
import { VENUE_LABEL } from '@/lib/venues'

// The season list with its "Nadolazeće | Prošle" toggle (#421).
//
// Both halves are rendered on the server and handed over together: the split
// itself is a decision of `splitSeasonPerformances`, not of the browser, and
// switching tabs on a phone in the street should cost no round trip. The
// component holds one piece of state, which tab is showing.

/** Where a performance happens: the venue label for a public row, the free-text
 *  location (plus the ship or organiser) for a private booking. */
function place(p: RosterPerformance): { main: string; client: string | null } {
  if (p.isPublic) {
    return { main: p.venue ? VENUE_LABEL.hr[p.venue] : '', client: null }
  }
  return { main: p.location ?? '', client: p.client }
}

function PerformanceCard({ p }: { p: RosterPerformance }) {
  const where = place(p)
  return (
    <li className={`app__card${p.cancelled ? ' app__card--cancelled' : ''}`}>
      <div className="app__card-top">
        <h2 className="app__card-when">{formatPerformanceDate(p.date)}</h2>
        <span className="app__card-time">{p.time}</span>
      </div>
      {where.main && (
        <p className="app__card-where">
          {where.main}
          {where.client && <span className="app__card-client"> · {where.client}</span>}
        </p>
      )}
      <span className={`app__tag${p.cancelled ? ' app__tag--cancelled' : ''}`}>
        {p.cancelled ? APP_STRINGS.card.cancelled : KIND_LABELS[p.kind]}
      </span>
      {p.voditeljNote && (
        <p className="app__note">
          <span className="app__note-label">{APP_STRINGS.card.noteLabel}</span>
          {p.voditeljNote}
        </p>
      )}
    </li>
  )
}

export function PerformanceList({
  upcoming,
  past,
}: {
  upcoming: RosterPerformance[]
  past: RosterPerformance[]
}) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const shown = tab === 'upcoming' ? upcoming : past
  const empty = tab === 'upcoming' ? APP_STRINGS.list.emptyUpcoming : APP_STRINGS.list.emptyPast

  return (
    <>
      <div className="app__tabs" role="tablist">
        {(['upcoming', 'past'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="app__tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {APP_STRINGS.tabs[key]}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="app__empty">{empty}</p>
      ) : (
        <ul className="app__list">
          {shown.map((p) => (
            <PerformanceCard key={p.id} p={p} />
          ))}
        </ul>
      )}
    </>
  )
}
