import Link from 'next/link'
import { loadInquiry } from '@/lib/app/inquiries-data'
import { replyMailto } from '@/lib/app/inquiries-mailto'
import { isBookingInquiry, stateLabel, typeLabel } from '@/lib/app/inquiries-view'
import { zagrebStamp } from '@/lib/app/orders-view'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../../../AppShell'
import { openScreen } from '../../../gate'
import { Card, Chip } from '../../../ui'
import { InquiryActions } from './InquiryActions'

// `/app/inquiries/[id]` — one enquiry (#507), in the T1 skin (#570).
//
// The facts, then the whole message, then the two actions. The message is the
// point of the screen and it is printed in full, unwrapped and unsummarised:
// this is somebody asking to book a private izvedba, and the answer to it
// depends on the sentence they wrote about how many people are coming.
//
// The `mailto:` is built on the SERVER, so the encoding (CRLF, `>` quoting, the
// length cut) is tested rather than assembled in the browser, and the button is
// an anchor that opens Gmail with the reply already started.
//
// Nothing on this page edits the enquiry. What a stranger wrote is a record;
// the only thing that changes is whether somebody has answered it.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.inquiries
const D = S.detail

/** One line of the facts card: a label and a value, never an input. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="app__fact">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  )
}

export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { viewer, refusal } = await openScreen('inquiries')
  if (refusal) return refusal

  const { id } = await params
  const inquiry = await loadInquiry(id)

  if (!inquiry) {
    return (
      <AppShell viewer={viewer} screen="inquiries" title={D.missing}>
        <Card className="app__empty">
          <p>{D.missing}</p>
          <Link className="ui-btn ui-btn--link" href="/app/inquiries">
            {D.back}
          </Link>
        </Card>
      </AppShell>
    )
  }

  const name = inquiry.name.trim() || D.noName
  const mailto = replyMailto(inquiry)

  return (
    <AppShell viewer={viewer} screen="inquiries" title={name}>
      <Link className="app__back" href="/app/inquiries">
        ‹ {D.back}
      </Link>

      <Card eyebrow={D.eyebrow} className="app__facts">
        <Fact label={D.email}>
          {inquiry.email ? (
            // A tap on the address is the second way to answer, and on a laptop
            // it is the one that lands in the mail client that is already open.
            <a className="app__fact-link" href={`mailto:${inquiry.email}`}>
              {inquiry.email}
            </a>
          ) : (
            D.noEmail
          )}
        </Fact>
        <Fact label={D.type}>
          {typeLabel(inquiry.enquiryType)}
          {isBookingInquiry(inquiry.enquiryType) && <Chip tone="gold">{S.booking}</Chip>}
        </Fact>
        <Fact label={D.received}>{zagrebStamp(inquiry.createdAt)}</Fact>
        <Fact label={D.state}>
          <Chip tone={inquiry.status === 'new' ? 'gold' : 'plain'}>
            {stateLabel(inquiry.status)}
          </Chip>
        </Fact>
      </Card>

      <Card eyebrow={D.message} className="app__message">
        {/* The message keeps its own line breaks (`white-space: pre-wrap` in
            app.css): a paragraph a person typed is a paragraph. */}
        <p>{inquiry.message}</p>
      </Card>

      <InquiryActions inquiryId={inquiry.id} status={inquiry.status} mailto={mailto} />
    </AppShell>
  )
}
