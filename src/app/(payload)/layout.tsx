import { RootLayout } from '@payloadcms/next/layouts'
import config from '@payload-config'
import React from 'react'

const importMap = {}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RootLayout config={config} importMap={importMap}>
      {children}
    </RootLayout>
  )
}
