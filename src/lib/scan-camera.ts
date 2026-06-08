// Pure builder for the html5-qrcode `Html5Qrcode.start()` arguments, kept out
// of the React component so the html5-qrcode call contract can be unit-tested
// (see scan-camera.test.ts). This contract bit us hard: html5-qrcode's FIRST
// start() argument, when an object, must have EXACTLY ONE key and it must be
// `facingMode` or `deviceId` — otherwise it rejects with a non-Error *string*
// ("cameraIdOrConfig … should have exactly 1 key") that surfaces to the user as
// a generic "Camera unavailable". Full video constraints (resolution + focus)
// belong in the SECOND argument's `videoConstraints` field, which html5-qrcode
// forwards to getUserMedia.

export interface ScanStartArgs {
  /** First start() arg: must stay a single-key facingMode/deviceId object. */
  cameraIdOrConfig: { facingMode: string }
  /** Second start() arg: scan loop config + the real camera constraints. */
  config: {
    fps: number
    qrbox: { width: number; height: number }
    videoConstraints: MediaTrackConstraints
  }
}

// Audio-only keys html5-qrcode rejects inside `videoConstraints`
// (VideoConstraintsUtil.isMediaStreamConstraintsValid). Exported so the test
// asserts our constraints avoid them.
export const HTML5_QRCODE_BANNED_VIDEO_CONSTRAINT_KEYS = [
  'autoGainControl',
  'channelCount',
  'echoCancellation',
  'latency',
  'noiseSuppression',
  'sampleRate',
  'sampleSize',
  'volume',
] as const

/**
 * Build the two positional arguments for `Html5Qrcode.start()`.
 *
 * @param boxSize  side length (px) of the square QR aim box.
 */
export function buildScanStartArgs(boxSize: number): ScanStartArgs {
  return {
    // Single key, on purpose — see the contract note above. When
    // `videoConstraints` is supplied, html5-qrcode ignores this for the actual
    // getUserMedia call but still requires it to be a valid single-key object.
    cameraIdOrConfig: { facingMode: 'environment' },
    config: {
      fps: 10,
      qrbox: { width: boxSize, height: boxSize },
      // HD + continuous autofocus: a blurry/low-res frame is undecodable no
      // matter how good the decoder. `ideal` keeps every hint best-effort;
      // `focusMode` is non-standard (Android Chrome honours it via `advanced`,
      // iOS Safari ignores it and autofocuses continuously anyway).
      videoConstraints: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        focusMode: 'continuous',
        advanced: [{ focusMode: 'continuous' }],
      } as unknown as MediaTrackConstraints,
    },
  }
}
