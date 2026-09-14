'use client'

import { useRouter } from 'next/navigation'
import type { CompMemberTally } from '@/lib/app/comp-screen'
import { APP_STRINGS } from '@/lib/app/strings'
import { Card, Section } from '../ui'

// "Gratis po članu" (#506) — the flat per-member table ADR-0019 asked for, and
// since #570 the first thing on the screen (Q44): the season's record is what
// Gratis is opened to read, and the form that writes it is one tap away.
//
// Client-side for one reason only: the season dropdown navigates. Everything in
// it is server-rendered data, counted by `tallyCompsByMember` and never
// recomputed here.
//
// Counts, never money. A comp is `total = 0` by construction, so the column
// that would say "value" would say zero on every row; what the society actually
// wants to know is how many seats a member has had this season, and how many of
// those were taken back.

const S = APP_STRINGS.gratis

export function PerMemberTable({
  rows,
  season,
  seasons,
}: {
  rows: CompMemberTally[]
  season: number
  seasons: number[]
}) {
  const router = useRouter()

  return (
    <section className="app__comp-permember">
      <Section title={S.perMemberTitle} />

      <div className="app__stats-season">
        <label className="app__stats-label" htmlFor="comp-season">
          {S.seasonLabel}
        </label>
        <select
          id="comp-season"
          className="app__select"
          value={String(season)}
          onChange={(e) => router.push(`/app/comp?season=${e.target.value}`)}
        >
          {seasons.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <Card className="app__empty">
          <p>{S.perMemberEmpty}</p>
        </Card>
      ) : (
        <table className="app__stats">
          <thead>
            <tr>
              <th scope="col">{S.colMember}</th>
              <th scope="col">{S.colAdults}</th>
              <th scope="col">{S.colChildren}</th>
              <th scope="col">{S.colIssued}</th>
              <th scope="col">{S.colVoided}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.memberId}>
                <th scope="row">{row.memberName}</th>
                <td>{row.adults}</td>
                <td>{row.children}</td>
                <td>{row.issued}</td>
                <td>{row.voided > 0 ? row.voided : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
