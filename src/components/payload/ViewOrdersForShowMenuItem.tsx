'use client'

import React from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import Link from 'next/link'

export function ViewOrdersForShowMenuItem() {
  const { id, collectionSlug } = useDocumentInfo()

  if (collectionSlug !== 'shows' || !id) return null

  const href = `/admin/collections/orders?where[show][equals]=${id}`

  return (
    <Link
      href={href}
      style={{
        display: 'block',
        width: '100%',
        padding: '8px 16px',
        background: 'transparent',
        textDecoration: 'none',
        textAlign: 'left',
        fontSize: 14,
        color: 'inherit',
      }}
    >
      View orders for this show
    </Link>
  )
}
