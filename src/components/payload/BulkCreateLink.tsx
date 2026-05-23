'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

export function BulkCreateLink() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push('/admin/bulk-create-shows')}
      style={{
        padding: '8px 16px',
        background: 'var(--theme-success-500, #38a169)',
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      Bulk Create
    </button>
  )
}
