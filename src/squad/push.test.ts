import { describe, expect, it } from 'vitest'
import { vapidKeyMismatch } from './push'

const key = (...bytes: number[]) => Uint8Array.from(bytes)

describe('push VAPID key comparison', () => {
  it('keeps a subscription made with the current key', () => {
    expect(vapidKeyMismatch(key(4, 1, 2, 3).buffer, key(4, 1, 2, 3))).toBe(false)
  })
  it('recreates it when the key differs, has another length or is missing', () => {
    expect(vapidKeyMismatch(key(4, 1, 2, 3).buffer, key(4, 1, 2, 9))).toBe(true)
    expect(vapidKeyMismatch(key(4, 1, 2).buffer, key(4, 1, 2, 3))).toBe(true)
    expect(vapidKeyMismatch(null, key(4, 1, 2, 3))).toBe(true)
    expect(vapidKeyMismatch(undefined, key(4, 1, 2, 3))).toBe(true)
  })
})
