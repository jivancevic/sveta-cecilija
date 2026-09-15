// Which way a finger is going (#633).
//
// Pull-to-refresh and a horizontal scroller want the same touch. The strip of
// filters on Ljestvica sits at the top of its screen, so `scrollTop` is 0 and
// the pull arms on every touch that lands on it; the pull then read only the Y
// delta, so a sideways swipe that drifted a few pixels down was treated as a
// pull and `preventDefault`ed. The chips did not move, and the screen read as
// stuck rather than as anything a person could fix by swiping more carefully.
//
// The fix is an axis lock, and the shape of it is the usual one: the first
// millimetres of a drag decide what the gesture IS, and after that it does not
// change its mind. Pure and here rather than in the component so the rule can
// be read back in a test.

/** Below this the finger has not said anything yet: a tap wobbles a pixel or two. */
export const AXIS_SLOP = 8

/** What the first few millimetres of a drag mean. */
export type DragAxis = 'undecided' | 'vertical' | 'horizontal'

/**
 * The axis of a drag, from its total travel since the finger went down.
 *
 * Deliberately NOT a running comparison of the last two points: a finger that
 * starts sideways and then curves down is still finishing the sideways scroll
 * it started, and a pull that took over halfway through would be exactly the
 * jerk this is here to remove.
 *
 * A diagonal at 45° reads as vertical, because a pull is the gesture with the
 * larger target and the smaller cost of being wrong: an unwanted pull is undone
 * by letting go, while a scroller that refuses the finger has nothing to undo.
 */
export function dragAxis(dx: number, dy: number): DragAxis {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (Math.max(ax, ay) < AXIS_SLOP) return 'undecided'
  return ax > ay ? 'horizontal' : 'vertical'
}
