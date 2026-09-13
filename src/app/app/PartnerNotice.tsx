import { APP_STRINGS } from '@/lib/app/strings'
import type { PartnerScreenState } from '@/lib/app/partner-screen'

// The fail-safe screen both partner screens fall back to (#505).
//
// A `partner` login whose Partner link is missing never reaches here in
// practice, because the shell strips the permission from the set when the link
// is absent (`NavContext.hasPartner`) and the page gate then refuses the
// screen. It is still written out, because "the gate happens to cover it" is
// not a reason for a page to crash if the gate ever changes.
//
// The deactivated partner IS reachable: the link resolves, the screen opens,
// and `/api/partner/sell` would 403 every attempt. So it says so in one
// sentence, names the account, and shows no figure of any kind.
export function PartnerNotice({ state }: { state: PartnerScreenState }) {
  if (state.kind === 'ok') return null

  const inactive = state.kind === 'inactive'
  return (
    <section className="app__empty-state">
      <b>{inactive ? APP_STRINGS.sell.inactiveTitle : APP_STRINGS.sell.unlinkedTitle}</b>
      {inactive && <p className="app__partner-name">{state.name}</p>}
      <p>{inactive ? APP_STRINGS.sell.inactiveBody : APP_STRINGS.sell.unlinkedBody}</p>
    </section>
  )
}
