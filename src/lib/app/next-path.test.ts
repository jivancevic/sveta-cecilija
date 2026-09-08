import { describe, expect, it } from 'vitest'
import { APP_HOME, safeAppNextPath } from './next-path'

describe('safeAppNextPath', () => {
  it('keeps a path inside /app, query string and all', () => {
    expect(safeAppNextPath('/app')).toBe('/app')
    expect(safeAppNextPath('/app/izvedba/12')).toBe('/app/izvedba/12')
    expect(safeAppNextPath('/app/authorize?client_id=abc&state=xyz')).toBe(
      '/app/authorize?client_id=abc&state=xyz',
    )
  })

  it('refuses anything that could leave the site', () => {
    expect(safeAppNextPath('https://evil.example/app')).toBe(APP_HOME)
    expect(safeAppNextPath('//evil.example')).toBe(APP_HOME)
    expect(safeAppNextPath('/\\evil.example')).toBe(APP_HOME)
    expect(safeAppNextPath('\\\\evil.example')).toBe(APP_HOME)
    expect(safeAppNextPath('/app\\..\\admin')).toBe(APP_HOME)
  })

  it('refuses a path elsewhere on this site', () => {
    expect(safeAppNextPath('/admin')).toBe(APP_HOME)
    expect(safeAppNextPath('/tickets')).toBe(APP_HOME)
    // A prefix is not a path segment: /application is not inside /app.
    expect(safeAppNextPath('/application')).toBe(APP_HOME)
  })

  it('falls back for anything that is not a string path', () => {
    expect(safeAppNextPath(undefined)).toBe(APP_HOME)
    expect(safeAppNextPath('')).toBe(APP_HOME)
    expect(safeAppNextPath('   ')).toBe(APP_HOME)
    expect(safeAppNextPath(['/app/izvedba/1'])).toBe(APP_HOME)
    expect(safeAppNextPath(42)).toBe(APP_HOME)
  })
})
