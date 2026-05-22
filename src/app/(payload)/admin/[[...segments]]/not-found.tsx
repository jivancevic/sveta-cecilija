import { NotFoundPage } from '@payloadcms/next/views'
import type { ImportMap } from 'payload'
import config from '@payload-config'

const importMap: ImportMap = {}

type Args = {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<{ [key: string]: string | string[] }>
}

export default function NotFound(args: Args) {
  return NotFoundPage({
    config,
    importMap,
    params: args.params,
    searchParams: args.searchParams,
  })
}
