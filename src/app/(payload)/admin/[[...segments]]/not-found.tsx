import { NotFoundPage } from '@payloadcms/next/views'
import config from '@payload-config'
import { importMap } from '../importMap'

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
