import { buildEventJsonLd, type EventShowInput } from '@/lib/event-jsonld'

/**
 * Emits one or more <script type="application/ld+json"> blocks with
 * Schema.org Event payloads. Server component — no client JS.
 */
export default function EventJsonLd({
  shows,
  image,
}: {
  shows: EventShowInput[]
  image?: string
}) {
  if (shows.length === 0) return null
  return (
    <>
      {shows.map((show) => (
        <script
          key={show.id}
          type="application/ld+json"
          // Safe: payload is built server-side from typed values; no untrusted strings.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildEventJsonLd(show, { image })),
          }}
        />
      ))}
    </>
  )
}
