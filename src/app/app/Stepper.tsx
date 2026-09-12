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
// `CompTickets` and `ThresholdEditor` still carry their own copies from before
// this existed; they fold into this one when those screens are next touched.
export function Stepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (next: number) => void
}) {
  return (
    <div className="app__stepper">
      <span className="app__stepper-label">{label}</span>
      <button
        type="button"
        className="app__stepper-button"
        aria-label={`${label} -`}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        -
      </button>
      <span className="app__stepper-value">{value}</span>
      <button
        type="button"
        className="app__stepper-button"
        aria-label={`${label} +`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}
