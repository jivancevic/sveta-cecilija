import { INQUIRY_STATES, inquiriesHref } from '@/lib/app/inquiries-query'
import type { InquiriesQuery } from '@/lib/app/inquiries-query'
import { stateLabel } from '@/lib/app/inquiries-view'
import { APP_STRINGS } from '@/lib/app/strings'
import { FilterChips, type FilterChipItem } from '../../ui'

// The one filter above the inbox (#507), as chips since #570.
//
// One control, because an enquiry has one question about it: has somebody
// answered this yet. A search box would be a second thing to read for a list
// that has held twenty-six rows in three seasons.
//
// It was a self-submitting `<select>` and is now the same row of link chips
// Narudžbe wears, which is the whole of this screen's redesign (Q42): the same
// query parameter, the same three views, the same server. A chip is an address,
// so this is no longer a client component at all — the filter works with
// JavaScript off and ships no JavaScript when it is on.

const S = APP_STRINGS.inquiries

export function InquiriesFilter({ query }: { query: InquiriesQuery }) {
  const items: FilterChipItem[] = [
    { key: '', label: S.all, href: inquiriesHref({ state: null, page: 1 }) },
    ...INQUIRY_STATES.map((state) => ({
      key: state,
      label: stateLabel(state),
      href: inquiriesHref({ state, page: 1 }),
    })),
  ]

  return (
    <div className="app__filters">
      <FilterChips items={items} active={query.state ?? ''} label={S.filterLabel} />
    </div>
  )
}
