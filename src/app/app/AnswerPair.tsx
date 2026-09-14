'use client'

import { useEffect, useRef, useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import { SWORDS_PATHS } from './ui/ScreenIcon'

// Dolazim / Ne dolazim, as a PAIR that never collapses (#592, prototype
// variant A).
//
// The shape this replaces asked the question once and then became a statement
// with a "Promijeni" link under it: three states to read, two taps to change an
// answer, and the army printed on a button that a dancer never chooses. What a
// dancer actually does with this control is change their mind, so both buttons
// are always on screen, the chosen one is filled and the other one is outlined
// at .55, and switching is one tap on the other one.
//
// **The words are always "Dolazim" and "Ne dolazim"** (Q19). Never the army:
// which army an answer counts in is the server's decision
// (`decideAttendanceAnswer`), it can be changed by a voditelj on Stanje, and a
// button that reports it is a button whose label moves under the thumb.
//
// This component knows NOTHING about attendance. It is handed a state and a
// callback; `moreska/Answer.tsx` owns the optimistic update, the revert and the
// `router.refresh()`. That is what lets the hero and a hero half draw the same
// control at two sizes without either of them re-typing the animation.
//
// ── The tap ────────────────────────────────────────────────
// Ported from the prototype as accepted, not re-invented:
//
//   the two blades redraw from opposite corners (stroke-dashoffset, 260ms,
//   60ms apart) and the green fill expands FROM THE CROSSING of the blades
//   rather than from the finger — the picture is two swords meeting, so the
//   colour has to come out of where they meet;
//   a white flash ring at the crossing plus six sparks, alternating gold and
//   the green, on the moment of the clash;
//   a spring on the pressed button, an ease back on the other one, and
//   `navigator.vibrate(10)` where the phone has it.
//
// Ne dolazim is deliberately quieter: the sunk fill comes from the tap point,
// the X draws itself, the spring is the same, and there are no sparks — saying
// no is an answer, not an event.
//
// The sparks and the ring are appended to the PAIR's wrapper, not to the
// button: the button clips its own fill (`overflow: hidden`), which is what
// keeps the radial fill inside its corners, and a spark has to leave it.
//
// Under `prefers-reduced-motion` every one of those is dropped and the colours
// simply swap, which is the honest still version of the same thing.

/** Which of the two is filled, or neither. */
export type AnswerPairState = 'none' | 'yes' | 'no'

const S = APP_STRINGS.answer

/**
 * The crossed swords: the same drawing the Moreška tab carries, and since #592
 * literally the same paths (`SWORDS_PATHS`) rather than a lookalike copied out
 * of the prototype. A dancer taps this button to say they are coming to a
 * moreška, so the picture on it has to be the picture of the moreška screen.
 *
 * The two blades keep `app__ans-s1` / `app__ans-s2`, the hilts `app__ans-hilt`:
 * the animation is the blades redrawing themselves and the hilts arriving after
 * them, and it is spelled in `app.css`, not here.
 */
function SwordsMark({ strokeWidth }: { strokeWidth: number }) {
  return (
    <svg
      className="app__ans-mk"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {SWORDS_PATHS.blades.map((d, i) => (
        <path key={d} className={i === 0 ? 'app__ans-s1' : 'app__ans-s2'} d={d} />
      ))}
      {SWORDS_PATHS.hilts.map((d) => (
        <path key={d} className="app__ans-hilt" d={d} />
      ))}
    </svg>
  )
}

/** A circle that empties, and an X that draws itself inside it. */
function CrossMark({ strokeWidth }: { strokeWidth: number }) {
  return (
    <svg
      className="app__ans-mk"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.2" />
      <path className="app__ans-draw" d="m8.6 8.6 6.8 6.8M15.4 8.6l-6.8 6.8" />
    </svg>
  )
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** A point in the pair's own coordinates, from one in the button's. */
function pointInGroup(
  group: HTMLElement,
  button: HTMLElement,
  x: number,
  y: number,
): { x: number; y: number } {
  const g = group.getBoundingClientRect()
  const b = button.getBoundingClientRect()
  return { x: b.left - g.left + x, y: b.top - g.top + y }
}

export interface AnswerPairProps {
  state: AnswerPairState
  /** Called on a tap that is not the answer already standing. */
  onChoose: (next: 'yes' | 'no') => void
  /** 36px instead of 52px: a hero half, or a row. */
  small?: boolean
  disabled?: boolean
}

export function AnswerPair({ state, onChoose, small = false, disabled = false }: AnswerPairProps) {
  const group = useRef<HTMLDivElement | null>(null)
  // The spring is a one-shot cleared on a TIMER rather than on `animationend`,
  // the same trade `Answer` makes for its pop: the tap also starts a
  // `router.refresh()` transition, and a state update landing inside that
  // transition was observed to be rolled back by the transition's own render,
  // leaving the class on forever and the next tap silent.
  const [popping, setPopping] = useState<'yes' | 'no' | null>(null)

  useEffect(() => {
    if (popping === null) return
    const handle = setTimeout(() => setPopping(null), 600)
    return () => clearTimeout(handle)
  }, [popping])

  function decorate(node: HTMLElement, className: string, at: { x: number; y: number }) {
    const el = document.createElement('span')
    el.className = className
    el.style.left = `${at.x}px`
    el.style.top = `${at.y}px`
    node.appendChild(el)
    return el
  }

  function tap(choice: 'yes' | 'no', event: React.MouseEvent<HTMLButtonElement>) {
    if (disabled) return
    const button = event.currentTarget
    const rect = button.getBoundingClientRect()
    const reduce = prefersReducedMotion()

    // Where the fill starts. The finger's point for "Ne dolazim"; the crossing
    // of the two blades for "Dolazim", because the green is what the clash
    // throws off and a fill starting at a thumb says nothing.
    let x = event.clientX ? event.clientX - rect.left : rect.width / 2
    let y = event.clientY ? event.clientY - rect.top : rect.height / 2
    const mark = choice === 'yes' ? button.querySelector('.app__ans-mk') : null
    if (mark) {
      const m = mark.getBoundingClientRect()
      x = m.left - rect.left + m.width / 2
      y = m.top - rect.top + m.height / 2
    }
    button.style.setProperty('--x', `${x}px`)
    button.style.setProperty('--y', `${y}px`)

    setPopping(choice)

    const node = group.current
    if (node && choice === 'yes' && !small && !reduce) {
      const at = pointInGroup(node, button, x, y)
      // The ring is late on purpose: the blades take 260ms to meet, and a
      // flash before they do is a flash at nothing.
      const ring = decorate(node, 'app__ans-flash', at)
      ring.style.animationDelay = '230ms'
      setTimeout(() => ring.remove(), 570)

      const count = 6
      for (let i = 0; i < count; i += 1) {
        const angle =
          ((-90 + (i - (count - 1) / 2) * 26 + (Math.random() * 14 - 7)) * Math.PI) / 180
        const distance = 26 + Math.random() * 14
        const spark = decorate(
          node,
          `app__ans-spark${i % 2 ? ' app__ans-spark--yes' : ''}`,
          at,
        )
        spark.style.setProperty('--dx', `${(Math.cos(angle) * distance).toFixed(1)}px`)
        spark.style.setProperty('--dy', `${(Math.sin(angle) * distance).toFixed(1)}px`)
        setTimeout(() => spark.remove(), 560)
      }
    }

    navigator.vibrate?.(10)
    onChoose(choice)
  }

  const stroke = small ? 2.4 : 2.2
  const classes = ['app__ans', small ? 'app__ans--sm' : ''].filter(Boolean).join(' ')

  return (
    <div className={classes} data-state={state} ref={group}>
      <button
        type="button"
        className={`app__ansbtn app__ansbtn--yes${popping === 'yes' ? ' app__ansbtn--pop' : ''}`}
        aria-pressed={state === 'yes'}
        disabled={disabled}
        onClick={(event) => tap('yes', event)}
      >
        <SwordsMark strokeWidth={stroke} />
        <span className="app__ans-fill" aria-hidden="true" />
        <span className="app__ans-lbl">{S.coming}</span>
      </button>

      <button
        type="button"
        className={`app__ansbtn app__ansbtn--no${popping === 'no' ? ' app__ansbtn--pop' : ''}`}
        aria-pressed={state === 'no'}
        disabled={disabled}
        onClick={(event) => tap('no', event)}
      >
        <CrossMark strokeWidth={stroke} />
        <span className="app__ans-fill" aria-hidden="true" />
        <span className="app__ans-lbl">{S.notComing}</span>
      </button>
    </div>
  )
}
