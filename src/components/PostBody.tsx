import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

interface Props {
  data: unknown
}

/**
 * Renders a Payload lexical richText field. Wrapped in `.post-body` so the
 * blog post stylesheet can scope typography without touching the rest of
 * `.inner-page .t-stone`.
 */
export default function PostBody({ data }: Props) {
  if (!data || typeof data !== 'object') return null
  return (
    <div className="post-body">
      <RichText data={data as SerializedEditorState} />
    </div>
  )
}
