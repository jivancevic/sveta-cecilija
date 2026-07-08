import type { CollectionBeforeDeleteHook, CollectionConfig } from 'payload'
import { isAdminTier } from '@/lib/access/roles'
import { partnerOwnOrdersWhere } from '@/lib/access/partner'

type ReqUser = { role?: string; partner?: unknown } | null | undefined

const adminOnly = ({ req }: { req: { user: unknown } }) =>
  isAdminTier(req.user as ReqUser)

// Cascade a per-person ticket delete when its order is deleted.
//
// The `tickets.order_id` FK is `ON DELETE SET NULL` (Payload's generated
// default for a relationship column) but the column is `NOT NULL`, so the DB
// alone cannot delete an order that still has tickets — it errors with
//   null value in column "order_id" of relation "tickets"
//   violates not-null constraint
// which is exactly the "delete order" failure in the admin UI. We can't flip
// the FK to CASCADE in db/schema without diverging from Payload push (the
// schema-drift gate mirrors it, and 00-base.sql is regenerated from a push, so
// the change would be silently reverted). So we cascade here instead: delete
// the order's tickets first, in the SAME transaction (pass `req`), so the
// subsequent order delete has no referencing rows. Seats are COUNT(active
// tickets), so removing them frees the seats correctly.
//
// Runs for every order delete (single or bulk; beforeDelete fires per-doc).
export const cascadeOrderTicketsDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  await req.payload.delete({
    collection: 'tickets',
    where: { order: { equals: id } },
    req,
    overrideAccess: true,
  })
}

export const Orders: CollectionConfig = {
  slug: 'orders',
  access: {
    // Admin-tier reads every order; a partner reads only orders it sold
    // (orders.partner = self). Tehnika has no collection read (door lookups go
    // through the audited /api/orders/lookup route, not this access).
    read: ({ req }) => {
      const user = req.user as ReqUser
      if (isAdminTier(user)) return true
      return partnerOwnOrdersWhere(user)
    },
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    // Delete an order's tickets before the order itself (see hook comment).
    beforeDelete: [cascadeOrderTicketsDelete],
  },
  admin: {
    useAsTitle: 'buyerName',
    defaultColumns: ['buyerName', 'email', 'adultCount', 'childCount', 'total', 'refundStatus', 'show'],
    listSearchableFields: ['buyerName', 'email'],
    hidden: ({ user }) => !isAdminTier(user as { role?: string } | null),
    components: {
      edit: {
        editMenuItems: ['@/components/payload/RefundOrderMenuItem#RefundOrderMenuItem'],
      },
    },
  },
  fields: [
    // Short human order reference (ADR-0007). Set at issuance; printed on
    // partner slips and read back at the door. Unique; legacy rows may be NULL.
    { name: 'code', type: 'text', unique: true, admin: { readOnly: true, description: 'Order reference code' } },
    {
      name: 'channel',
      type: 'select',
      required: true,
      defaultValue: 'online',
      options: [
        { label: 'Online (Stripe)', value: 'online' },
        { label: 'Partner (POS)', value: 'partner' },
        { label: 'Comp (goodwill)', value: 'comp' },
      ],
      admin: { description: 'Sales channel; drives pricing and invoicing' },
    },
    // Partner who sold this order; null for online (ADR-0008). Column stays
    // `partner_id`; now a real relationship to the partners collection (#143).
    {
      name: 'partner',
      type: 'relationship',
      relationTo: 'partners',
      admin: { readOnly: true, description: 'Partner that sold this order (partner channel only)' },
    },
    // Society member who received these comps; null for online/partner (ADR-0019,
    // #318). Attribution only, never printed on the slip. Column `member_id`.
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      admin: { readOnly: true, description: 'Member that received this order (comp channel only)' },
    },
    // Promo code applied to this online order (ADR-0018, #325). Null for
    // partner/comp and for online orders with no code. Attribution + reporting
    // only; `order.total` stays authoritative (Stripe amountReceived). The
    // checkout/webhook wiring that sets it lands in #324. Column `promo_code_id`.
    {
      name: 'promoCode',
      type: 'relationship',
      relationTo: 'promo-codes',
      admin: { readOnly: true, description: 'Promo code applied to this order (online channel only)' },
    },
    // Buyer PII — present online, null for an anonymous partner POS sale.
    { name: 'buyerName', type: 'text' },
    { name: 'email', type: 'email' },
    { name: 'adultCount', type: 'number', required: true },
    { name: 'childCount', type: 'number', required: true },
    { name: 'total', type: 'number', required: true, admin: { description: 'Amount in EUR cents' } },
    { name: 'stripePaymentIntentId', type: 'text' },
    {
      name: 'refundStatus',
      type: 'select',
      required: true,
      defaultValue: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Refunded', value: 'refunded' },
      ],
    },
    {
      name: 'show',
      type: 'relationship',
      relationTo: 'shows',
      required: true,
    },
    {
      name: 'locale',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Croatian', value: 'hr' },
      ],
      admin: {
        description: 'Buyer locale captured at checkout; drives post-purchase email language',
      },
    },
    {
      name: 'reviewEmailSentAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'Timestamp the T+2h post-show review-request email was sent. NULL = not yet sent.',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
  ],
}
