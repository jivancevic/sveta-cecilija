// One month of one partner's Obračun, live or frozen (#599).
//
// **The single entry point for the document**, and that is the point of the
// file: the screen, the CSV, the PDF and the freeze action all come through
// here, so what the secretary reads on screen, what the partner downloads and
// what the accountant invoices against are one computation rather than four
// that happen to agree today.
//
// **Two states, one shape.** A month that has been marked sent is served from
// `partner_statements` — the document as it stood — and a month that has not is
// computed from the rows as they are now. The caller does not choose; it asks
// for a month and is told which it got, because the answer changes what the
// screen may offer (you cannot re-freeze a frozen month, and you should not
// promise a live one is final).
//
// The frozen half is why this file exists at all. Commission lives on the
// Partner and used to be applied at read time, so raising a rate rewrote every
// month already invoiced. Reading a sent month from storage is the fix; every
// other guard would have been a convention someone eventually forgets.

import type { PoolQuery } from '@/lib/db/pool-query'
import type { PartnerRecord } from '@/lib/app/partner-screen'
import { getPartnerReconciliation } from './partner-data'
import { buildStatementDocument, type StatementDocument } from './statement-document'
import { createStatementStore, type StatementStore } from './statement-store'

/** When the month was stamped, and by whom. Null while the month is live. */
export interface StatementSent {
  at: string
  by: string | null
}

export interface LoadedStatement {
  document: StatementDocument
  /** Non-null exactly when the document came out of storage. */
  sent: StatementSent | null
}

/** The three fields of a Partner the document prints, off the repo record. */
export function partyOf(partner: PartnerRecord) {
  return {
    name: partner.name,
    oib: partner.oib ?? null,
    billingAddress: partner.billingAddress ?? null,
  }
}

/** Compute the month from the rows as they are right now. */
async function computeDocument(
  query: PoolQuery,
  partner: PartnerRecord,
  year: number,
  month: number,
): Promise<StatementDocument> {
  const statement = await getPartnerReconciliation(query, {
    partnerId: Number(partner.id),
    commissionPercent: partner.commissionPercent,
    year,
    month,
  })
  return buildStatementDocument({ statement, partner: partyOf(partner) })
}

export interface LoadStatementArgs {
  partner: PartnerRecord
  year: number
  month: number
  /** Injected in tests; defaults to the real table. */
  store?: StatementStore
}

/**
 * The document for one (partner, month): the stored one if the month has been
 * sent, otherwise a fresh computation.
 */
export async function loadPartnerStatement(
  query: PoolQuery,
  { partner, year, month, store = createStatementStore(query) }: LoadStatementArgs,
): Promise<LoadedStatement> {
  const frozen = await store.find(Number(partner.id), year, month)
  if (frozen) {
    return { document: frozen.document, sent: { at: frozen.sentAt, by: frozen.sentBy } }
  }
  return { document: await computeDocument(query, partner, year, month), sent: null }
}

export interface FreezeStatementArgs extends LoadStatementArgs {
  /** The account that pressed Označi poslanim; null when it is not a person. */
  sentBy: number | null
}

/**
 * Compute the month and store it, which is what "marking sent" means.
 *
 * The commission percent is written from the DOCUMENT rather than from the
 * Partner row, so the column and the JSON can never tell two different stories
 * about the rate this settlement was billed at.
 */
export async function freezePartnerStatement(
  query: PoolQuery,
  { partner, year, month, sentBy, store = createStatementStore(query) }: FreezeStatementArgs,
): Promise<StatementDocument> {
  const document = await computeDocument(query, partner, year, month)
  await store.markSent({
    partnerId: Number(partner.id),
    year,
    month,
    document,
    commissionPercent: document.commissionPercent,
    sentBy,
  })
  return document
}
