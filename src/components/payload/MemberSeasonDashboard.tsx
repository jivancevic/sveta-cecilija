import React from 'react'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import type { MemberSeason } from '@/lib/member/season'
import {
  GOLD,
  SECTION_LABEL_STYLE,
  accentNumberStyle,
  formatShowDate,
  venueLabel,
} from './dashboard/format'

// Read-only season view for the shared society-membership login (#362, ADR-0022).
//
// The whole page is one question answered: how many tickets has the season
// moved. There are no actions, no links, no money, no buyer data — every figure
// here is a count. The headline INCLUDES comps and is therefore labelled
// "izdano" (issued), never "prodano" (sold): the member question is "how many
// people did we play to", not "what did we bill". The channel strip keeps comps
// visible as their own slice so the headline can't be misread as revenue.
export function MemberSeasonDashboard({
  season,
  lang,
}: {
  season: MemberSeason
  lang: AdminLang
}) {
  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 40px)', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4, fontSize: 24 }}>
        {adminT(lang, 'memberSeasonTitle')} {season.year}
      </h1>
      <p style={{ color: 'var(--theme-elevation-600)', fontSize: 13, marginBottom: 24 }}>
        {adminT(lang, 'memberIntro')}
      </p>

      <HeadlineCard season={season} lang={lang} />

      <section style={{ marginTop: 24 }}>
        <div style={SECTION_LABEL_STYLE}>{adminT(lang, 'memberPerShow')}</div>
        {season.shows.length === 0 ? (
          <p style={{ color: 'var(--theme-elevation-600)' }}>{adminT(lang, 'memberNoShows')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {season.shows.map((s) => (
              <ShowRow key={s.showId} show={s} lang={lang} />
            ))}
          </div>
        )}
      </section>

      <CountsSection
        label={adminT(lang, 'memberTicketTypes')}
        note={season.types.boxOffice > 0 ? adminT(lang, 'memberBoxOfficeNote') : undefined}
        rows={[
          { label: adminT(lang, 'adults'), value: season.types.adult },
          { label: adminT(lang, 'children'), value: season.types.child },
          { label: adminT(lang, 'memberChannelBoxOffice'), value: season.types.boxOffice },
        ]}
      />

      <CountsSection
        label={adminT(lang, 'memberChannels')}
        rows={[
          { label: adminT(lang, 'channelOnline'), value: season.channels.online },
          { label: adminT(lang, 'memberChannelBoxOffice'), value: season.channels.boxOffice },
          { label: adminT(lang, 'channelPartner'), value: season.channels.partner },
          { label: adminT(lang, 'compSold'), value: season.channels.comp },
        ]}
      />
    </div>
  )
}

// The one figure the page exists for, with the season fill underneath it.
function HeadlineCard({ season, lang }: { season: MemberSeason; lang: AdminLang }) {
  return (
    <div
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 12,
        padding: '28px 20px',
        textAlign: 'center',
      }}
    >
      <div style={SECTION_LABEL_STYLE}>{adminT(lang, 'memberIssued')}</div>
      <div style={accentNumberStyle(56)}>{season.issued}</div>
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--theme-elevation-600)' }}>
        {adminT(lang, 'memberSeasonFill')}:{' '}
        <strong style={{ color: 'var(--theme-text)' }}>{season.fillPercent}%</strong>{' '}
        <span style={{ color: 'var(--theme-elevation-500)' }}>
          ({season.issued} / {season.capacity})
        </span>
      </div>
      <div style={{ marginTop: 10 }}>
        <FillBar percent={season.fillPercent} />
      </div>
    </div>
  )
}

function ShowRow({ show, lang }: { show: MemberSeason['shows'][number]; lang: AdminLang }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--theme-text)' }}>
            {formatShowDate(show.date, lang)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
            {show.time} · {venueLabel(show.venue, lang)}
          </div>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--theme-text)' }}>
            {show.issued}
          </span>
          <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
            {' '}
            / {show.capacity} · {show.percent}%
          </span>
        </div>
      </div>
      <FillBar percent={show.percent} />
    </div>
  )
}

function FillBar({ percent }: { percent: number }) {
  const height = 8
  return (
    <div
      style={{
        height,
        borderRadius: height,
        background: 'var(--theme-elevation-100)',
        overflow: 'hidden',
      }}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div style={{ width: `${percent}%`, height: '100%', background: GOLD, borderRadius: height }} />
    </div>
  )
}

// A plain label/count list. Deliberately not a chart: these are small integers
// that read faster as numbers, and the page has no other interactive surface.
function CountsSection({
  label,
  rows,
  note,
}: {
  label: string
  rows: { label: string; value: number }[]
  note?: string
}) {
  return (
    <section style={{ marginTop: 24 }}>
      <div style={SECTION_LABEL_STYLE}>{label}</div>
      <div
        style={{
          background: 'var(--theme-elevation-50)',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 8,
          padding: '4px 16px',
        }}
      >
        {rows.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 0',
              borderBottom:
                i === rows.length - 1 ? 'none' : '1px solid var(--theme-elevation-100)',
              fontSize: 14,
            }}
          >
            <span style={{ color: 'var(--theme-elevation-600)' }}>{r.label}</span>
            <strong style={{ color: 'var(--theme-text)' }}>{r.value}</strong>
          </div>
        ))}
      </div>
      {note && (
        <p style={{ fontSize: 11, color: 'var(--theme-elevation-500)', marginTop: 8 }}>{note}</p>
      )}
    </section>
  )
}
