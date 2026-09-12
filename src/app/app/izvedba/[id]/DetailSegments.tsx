'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import { DETAIL_SEGMENTS, type DetailSegment } from '@/lib/app/detail-view'

// The three segments of one evening (#457): Dolaze, Postava, Ulaznice.
//
// A client component that owns exactly one thing — which panel is on screen.
// All three panels are SERVER-rendered and arrive as children, so switching
// segments costs no request and leaks no roster query into the browser; this
// component never fetches, never counts and never decides what a panel says.
//
// The URL follows the thumb through `history.replaceState` rather than a
// navigation: a dancer flipping between "tko dolazi" and "postava" is reading
// one screen, not walking a history stack they then have to press Back through
// three times. The param still works the other way round, as the landing point
// of a push deep-link (`?dio=postava`), which is why the initial value is parsed
// on the server and handed down.

export function DetailSegments({
  initial,
  counts,
  dolaze,
  postava,
  ulaznice,
  tools,
  lineupState,
}: {
  initial: DetailSegment
  /** The number under each label, already worded ("3", "12/4", "–"). */
  counts: Record<DetailSegment, string>
  dolaze: React.ReactNode
  postava: React.ReactNode
  ulaznice: React.ReactNode
  /** The voditelj's controls, rendered inside the Alati card. Absent for a dancer. */
  tools?: React.ReactNode
  /**
   * One line about the postava, as a button that switches to it. It lives here
   * rather than in the page because it is the one tool whose action is "show me
   * the other segment", and the segment is this component's state.
   */
  lineupState?: string | null
}) {
  const [segment, setSegment] = useState<DetailSegment>(initial)

  function show(next: DetailSegment) {
    setSegment(next)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('dio', next)
    window.history.replaceState(null, '', url.toString())
  }

  const panels: Record<DetailSegment, React.ReactNode> = { dolaze, postava, ulaznice }

  return (
    <>
      <div className="app__segments" role="tablist" aria-label={APP_STRINGS.lineup.title}>
        {DETAIL_SEGMENTS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`app-seg-${key}`}
            aria-controls="app-seg-panel"
            className={`app__segment${segment === key ? ' app__segment--on' : ''}`}
            aria-selected={segment === key}
            onClick={() => show(key)}
          >
            {APP_STRINGS.detail.segments[key]}
            <b>{counts[key]}</b>
          </button>
        ))}
      </div>

      <div
        className="app__panel-body"
        id="app-seg-panel"
        role="tabpanel"
        aria-labelledby={`app-seg-${segment}`}
      >
        {panels[segment]}
      </div>

      {(tools || lineupState) && (
        <section className="app__lead">
          <h2 className="app__lead-head">{APP_STRINGS.lead.title}</h2>
          {tools}
          {lineupState && (
            <button
              type="button"
              className="app__lead-row"
              onClick={() => show('postava')}
            >
              {lineupState}
            </button>
          )}
        </section>
      )}
    </>
  )
}
