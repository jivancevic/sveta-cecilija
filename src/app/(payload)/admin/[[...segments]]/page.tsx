import type { Metadata } from 'next'
import type { ImportMap } from 'payload'
import { RootPage, generatePageMetadata } from '@payloadcms/next/views'
import config from '@payload-config'

const importMap: ImportMap = {}

type Args = {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<{ [key: string]: string | string[] }>
}

export const generateMetadata = async (args: Args): Promise<Metadata> => {
  try {
    return await generatePageMetadata({ config, params: args.params, searchParams: args.searchParams })
  } catch (err) {
    console.error('[admin] generateMetadata error:', err)
    return {}
  }
}

export default async function Page(args: Args) {
  try {
    return await RootPage({ config, importMap, params: args.params, searchParams: args.searchParams })
  } catch (err) {
    console.error('[admin] RootPage error:', err)
    throw err
  }
}
