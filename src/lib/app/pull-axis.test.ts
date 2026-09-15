import { describe, expect, it } from 'vitest'
import { AXIS_SLOP, dragAxis } from './pull-axis'

describe('dragAxis', () => {
  it('says nothing until the finger has travelled far enough to mean it', () => {
    expect(dragAxis(0, 0)).toBe('undecided')
    expect(dragAxis(AXIS_SLOP - 1, AXIS_SLOP - 1)).toBe('undecided')
  })

  it('reads a sideways swipe as horizontal even when it drifts down', () => {
    // The reported bug: a swipe across the filter strip that sags a few pixels.
    expect(dragAxis(40, 6)).toBe('horizontal')
    expect(dragAxis(-40, 6)).toBe('horizontal')
  })

  it('reads a pull as vertical even when it drifts sideways', () => {
    expect(dragAxis(5, 30)).toBe('vertical')
  })

  it('gives a 45° diagonal to the pull', () => {
    expect(dragAxis(20, 20)).toBe('vertical')
  })
})
