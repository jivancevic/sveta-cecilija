import React from 'react'
import type { CriticalEventRow } from '@/lib/critical-events/list'

// Collapsed superadmin-only dev strip on /admin (#235, ADR-0016). Surfaces the
// last N curated critical events (timestamp, kind, short context) so a silent
// failure seam — first wired: an enquiry email that never delivered — becomes
// visible at a glance. Rendered ONLY for superadmin by AdminDashboardView;
// admin / tehnika / partner never see it.
export function CriticalEventsDevStrip({ events }: { events: CriticalEventRow[] }) {
  return (
    <details
      style={{
        marginTop: 32,
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        padding: '12px 16px',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--theme-elevation-600)',
        }}
      >
        Dev · critical events ({events.length})
      </summary>

      {events.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--theme-elevation-500)', margin: '12px 0 0' }}>
          No critical events recorded.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
          {events.map((e) => (
            <li
              key={e.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'baseline',
                padding: '6px 0',
                borderTop: '1px solid var(--theme-elevation-100)',
                fontSize: 12,
              }}
            >
              <time
                dateTime={e.createdAt}
                style={{
                  flex: '0 0 auto',
                  color: 'var(--theme-elevation-500)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {formatTimestamp(e.createdAt)}
              </time>
              <code
                style={{
                  flex: '0 0 auto',
                  fontWeight: 600,
                  color: 'var(--theme-text)',
                }}
              >
                {e.kind}
              </code>
              <span
                style={{
                  flex: '1 1 auto',
                  color: 'var(--theme-elevation-600)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {shortContext(e.context)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

// Compact, locale-stable UTC stamp ("Jun 04 10:00"). Avoids timezone surprises
// in a tool that's only for the developer.
function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  })
}

// One-line summary of the JSON context (best-effort; never throws).
function shortContext(context: Record<string, unknown> | null): string {
  if (!context) return ''
  try {
    return Object.entries(context)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' · ')
  } catch {
    return ''
  }
}
