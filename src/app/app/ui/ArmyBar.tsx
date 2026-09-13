import { ChevronRight } from 'lucide-react'
import { APP_STRINGS } from '@/lib/app/strings'
import { armyStatus } from './army-status'

// The state of the two armies, in one bar (#562).
//
// Crni fill leftwards from the centre in ink, bili rightwards in red, and a
// gold tick on each side marks that army's threshold for THIS evening (#503's
// Pragovi, so it is a prop and never a constant). A number below its threshold
// turns warn and the line under the bar says how many are missing; at or above
// both, it says "Ima nas dovoljno" and stops talking.
//
// Twelve is the full half: the moreška is danced by twelve a side, so the bar
// is a picture of the dance rather than a percentage of an arbitrary maximum.
// Anything past twelve simply fills its half.
//
// It is a button when it is given an `onClick` or an `href`-less tap handler,
// and a plain block otherwise: on the hero it opens Stanje, on Stanje itself it
// IS the state and leads nowhere.

const FULL_HALF = 12

export interface ArmyBarProps {
  crni: number
  bili: number
  /** Per evening and per army. Defaults to the society's usual eight. */
  threshold?: { crni: number; bili: number }
  /** Makes the whole bar a button, with a chevron on the status line. */
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  className?: string
}

export function ArmyBar({
  crni,
  bili,
  threshold = { crni: 8, bili: 8 },
  onClick,
  className,
}: ArmyBarProps) {
  const status = armyStatus(crni, bili, threshold)
  const half = 50
  const width = (n: number) => `${Math.min(n / FULL_HALF, 1) * half}%`
  const tick = (n: number) => (Math.min(n, FULL_HALF) / FULL_HALF) * half

  const inside = (
    <>
      <div className="ui-army__heads">
        <div className="ui-army__side">
          <span className="ui-army__k">{APP_STRINGS.ui.armyCrni}</span>
          <span className={`ui-army__v${crni < threshold.crni ? ' ui-army__v--low' : ''}`}>
            {crni}
          </span>
        </div>
        <div className="ui-army__side">
          <span className={`ui-army__v${bili < threshold.bili ? ' ui-army__v--low' : ''}`}>
            {bili}
          </span>
          <span className="ui-army__k">{APP_STRINGS.ui.armyBili}</span>
        </div>
      </div>

      <div className="ui-army__split">
        <i className="ui-army__crni" style={{ width: width(crni) }} />
        <i className="ui-army__bili" style={{ width: width(bili) }} />
        <i className="ui-army__mid" />
        <i className="ui-army__tick" style={{ left: `${half - tick(threshold.crni)}%` }} />
        <i className="ui-army__tick" style={{ left: `${half + tick(threshold.bili)}%` }} />
      </div>

      <div className={`ui-army__status${status.ok ? '' : ' ui-army__status--low'}`}>
        <span className="ui-army__dot" aria-hidden="true" />
        {status.text}
        {onClick && (
          <span className="ui-army__chev" aria-hidden="true">
            <ChevronRight size={18} strokeWidth={1.75} />
          </span>
        )}
      </div>
    </>
  )

  const classes = ['ui-army', className ?? ''].filter(Boolean).join(' ')

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {inside}
      </button>
    )
  }
  return <div className={classes}>{inside}</div>
}
