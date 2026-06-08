import { describe, it, expect } from 'vitest'
import {
  buildScanStartArgs,
  HTML5_QRCODE_BANNED_VIDEO_CONSTRAINT_KEYS,
  type ScanStartArgs,
} from './scan-camera'

// Replicates html5-qrcode's createVideoConstraints() rule for the first
// start() argument (html5-qrcode.js: "object should have exactly 1 key" +
// "Only 'facingMode' and 'deviceId' are supported"). This is the exact check
// PR #290 violated by passing a 5-key constraints object as the first arg,
// which threw a non-Error string surfaced as "Camera unavailable".
function html5QrcodeFirstArgError(arg: unknown): string | null {
  if (!arg) return 'cameraIdOrConfig is required'
  if (typeof arg === 'string') return null // deviceId string is allowed
  if (typeof arg !== 'object') return 'must be string or object'
  const keys = Object.keys(arg as Record<string, unknown>)
  if (keys.length !== 1) return `should have exactly 1 key, found ${keys.length}`
  if (keys[0] !== 'facingMode' && keys[0] !== 'deviceId') {
    return `only facingMode/deviceId supported, got ${keys[0]}`
  }
  return null
}

describe('buildScanStartArgs', () => {
  const args: ScanStartArgs = buildScanStartArgs(240)

  it('first start() arg satisfies html5-qrcode (single facingMode/deviceId key)', () => {
    // The regression guard: PR #290 put width/height/focusMode/advanced here.
    expect(html5QrcodeFirstArgError(args.cameraIdOrConfig)).toBeNull()
    expect(Object.keys(args.cameraIdOrConfig)).toEqual(['facingMode'])
  })

  it('a multi-key first arg (the PR #290 regression) would be rejected', () => {
    // Proves the guard above has teeth.
    const regressed = {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      focusMode: 'continuous',
      advanced: [{ focusMode: 'continuous' }],
    }
    expect(html5QrcodeFirstArgError(regressed)).toMatch(/exactly 1 key/)
  })

  it('real camera constraints live in config.videoConstraints (reach getUserMedia)', () => {
    const vc = args.config.videoConstraints as Record<string, unknown>
    expect(vc.width).toEqual({ ideal: 1920 })
    expect(vc.height).toEqual({ ideal: 1080 })
    expect(vc.advanced).toEqual([{ focusMode: 'continuous' }])
  })

  it('videoConstraints uses none of html5-qrcode’s banned (audio) keys', () => {
    const keys = Object.keys(args.config.videoConstraints as Record<string, unknown>)
    for (const banned of HTML5_QRCODE_BANNED_VIDEO_CONSTRAINT_KEYS) {
      expect(keys).not.toContain(banned)
    }
  })

  it('threads the aim-box size into qrbox', () => {
    expect(args.config.qrbox).toEqual({ width: 240, height: 240 })
    expect(args.config.fps).toBe(10)
  })
})
