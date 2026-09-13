'use client'

// The plus/minus counter Cecilija uses instead of a native number input (#505).
//
// A native `<input type="number">` opens a numeric keypad, accepts a typed 400
// and puts a two-pixel spinner under a thumb; a clerk at a desk and a dancer in
// the street both want one tap per person. The classes are the shell's
// (`app__stepper*`, #490), so this looks the same wherever it lands.
//
// `max` is the ceiling the caller computes (seats left, a comp cap); the
// component only refuses to cross it. The server re-checks every one of those
// limits — this is the courtesy half.
//
// `min` and `bigStep` are #502's two additions and both default to today's
// behaviour, so nothing that already uses this control changes: the offline
// sales ledger counts a door batch of 68 and corrects a miscount by appending
// the inverse line (ADR-0025), which is a range that goes below zero and a
// count nobody taps out one at a time.
//
// `CompTickets` and `ThresholdEditor` still carry their own copies from before
// this existed; they fold into this one when those screens are next touched.
export function Stepper({
  label,
  value,
  max,
  min = 0,
  bigStep,
  disabled = false,
  onChange,
}: {
  label: string
  value: number
  max: number
  /** The floor. Below zero only where a negative is a real answer (#502). */
  min?: number
  /** When set, a second pair of keys moving by this much sits outside the ones. */
  bigStep?: number
  /** Both keys, while a sale is in flight: the counts are already committed. */
  disabled?: boolean
  onChange: (next: number) => void
}) {
  const clamp = (next: number) => Math.max(min, Math.min(max, next))
  const key = (step: number) => (
    <button
      key={step}
      type="button"
      className="app__stepper-button"
      aria-label={`${label} ${step > 0 ? `+${step}` : step}`}
      disabled={disabled || clamp(value + step) === value}
      onClick={() => onChange(clamp(value + step))}
    >
      {step > 0 ? `+${step}` : step}
    </button>
  )

  return (
    <div className="app__stepper">
      <span className="app__stepper-label">{label}</span>
      {bigStep ? key(-bigStep) : null}
      <button
        type="button"
        className="app__stepper-button"
        aria-label={`${label} -`}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        -
      </button>
      <span className="app__stepper-value">{value}</span>
      <button
        type="button"
        className="app__stepper-button"
        aria-label={`${label} +`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
      {bigStep ? key(bigStep) : null}
    </div>
  )
}
