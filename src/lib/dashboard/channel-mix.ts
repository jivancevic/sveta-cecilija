// Pure season channel-mix aggregation for the secretary dashboard (#242).
//
// Where did the season's seats come from? Three channels, never summed into a
// single "sold" anywhere else but rolled up here for the split bar:
//   - online    = active tickets bought through Stripe (orders.channel='online')
//   - inPerson  = box-office sales recorded on the show (shows.inPersonSold)
//   - partner   = active tickets sold by resellers (orders.channel='partner')
// The counts come from the data layer; this module turns them into ordered,
// percent-bearing segments for rendering. Percentages are each rounded
// independently (they may not sum to exactly 100 — the bar widths are driven by
// raw counts, so the visual is exact even when the labels round).

export type ChannelKey = 'online' | 'inPerson' | 'partner'

export interface ChannelSegment {
  key: ChannelKey
  count: number
  /** count as a whole-number % of the season total, 0 when there are no sales. */
  percent: number
}

export interface ChannelMix {
  online: number
  inPerson: number
  partner: number
  total: number
  /** Always in display order: online, in-person, partner. */
  segments: ChannelSegment[]
}

export function channelMix({
  online,
  inPerson,
  partner,
}: {
  online: number
  inPerson: number
  partner: number
}): ChannelMix {
  const total = online + inPerson + partner
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  return {
    online,
    inPerson,
    partner,
    total,
    segments: [
      { key: 'online', count: online, percent: pct(online) },
      { key: 'inPerson', count: inPerson, percent: pct(inPerson) },
      { key: 'partner', count: partner, percent: pct(partner) },
    ],
  }
}
