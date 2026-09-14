'use client'

import { APP_STRINGS } from '@/lib/app/strings'
import { SWORDS_PATHS } from './ui/ScreenIcon'
import type { AnswerPairState } from './AnswerPair'

// Dolazim / Ne dolazim as two CIRCLES, for a row on a list (#624).
//
// The same question `AnswerPair` asks, at the size a list can afford. A month
// of nastupi is fifteen rows deep and each of them carried the words "bez
// odgovora" in a grey pill, which said the same nothing fifteen times and gave
// a dancer no way to answer without opening the evening first. Two circles fit
// where the pill stood and are the answer itself.
//
// **Both circles are always drawn and the fill is the whole state** — the rule
// `AnswerPair` already follows, for the same reason: what a dancer does with
// this control is change their mind, and a control that collapses into a
// statement makes that two taps.
//
// It is deliberately NOT a small `AnswerPair`. The pair is a tap with an
// animation in it (blades redrawing, a fill out of the crossing, sparks), which
// is right for the one evening a screen is opened for and wrong fifteen times
// down a list; here the colour simply lands. The two share their vocabulary
// (`AnswerPairState`) and their drawing (`SWORDS_PATHS`), which is the part
// that must never diverge, and nothing else.
//
// Knows nothing about attendance: it is handed a state and a callback, and
// `moreska/Answer.tsx` owns the write, the un-tap and the refresh.

const S = APP_STRINGS.answer

export function AnswerDots({
  state,
  disabled = false,
  onChoose,
}: {
  state: AnswerPairState
  disabled?: boolean
  /**
   * Which circle was tapped — never what it means. Whether a tap is an answer
   * or an un-tap depends on `state`, and the caller is the one that knows what
   * an un-tap costs (`resolveUndo`: a promise that stood is taken back, not
   * un-said).
   */
  onChoose: (side: 'yes' | 'no') => void
}) {
  return (
    <div className="app__dots">
      <button
        type="button"
        className={`app__dot app__dot--yes${state === 'yes' ? ' app__dot--on' : ''}`}
        disabled={disabled}
        aria-pressed={state === 'yes'}
        aria-label={state === 'yes' ? S.undo : S.coming}
        onClick={() => onChoose('yes')}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {[...SWORDS_PATHS.blades, ...SWORDS_PATHS.hilts].map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </button>
      <button
        type="button"
        className={`app__dot app__dot--no${state === 'no' ? ' app__dot--on' : ''}`}
        disabled={disabled}
        aria-pressed={state === 'no'}
        aria-label={state === 'no' ? S.undo : S.notComing}
        onClick={() => onChoose('no')}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6 18 18" />
          <path d="M18 6 6 18" />
        </svg>
      </button>
    </div>
  )
}
