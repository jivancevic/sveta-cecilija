// The hero's top line, and the DANAS label at the far end of it (#609).
//
// Shared by Početna and Moreška, the same way `HeroMeta` and `HeroHalves` are:
// both screens draw the same evening out of the same `heroView()`, and a second
// copy of this row is how the two come to disagree about what tonight looks
// like.
//
// **The word is the meaning; everything around it is decoration.** The card's
// gold edge, its glow and its one-shot sweep are what a dancer notices from
// across a room, and they are also exactly what a reader with reduced motion
// on, or a colour-blind eye, does not get. So "DANAS" is text, in the flow, at
// the end of the eyebrow row — the one place on a card where an uppercase
// micro-label is already the house style — and the card still says the true
// thing with every effect stripped off it.
//
// Whether it is today is NOT decided here. `heroView()` decides it on the
// server, against the Europe/Zagreb day, and hands over a word or a null; this
// component only knows where to put it.

export function HeroEyebrow({ text, today }: { text: React.ReactNode; today: string | null }) {
  if (!today) return <>{text}</>
  return (
    <span className="app__hero-eyebrow">
      <span>{text}</span>
      <b className="app__hero-today">{today}</b>
    </span>
  )
}
