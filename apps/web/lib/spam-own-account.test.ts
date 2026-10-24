import { describe, expect, it } from 'vitest'
import type { Hex, NostrEvent } from '@nostrich/nostr'

import { rejectEvent } from './spam'

const READER = 'ab'.repeat(32) as Hex
const STRANGER = 'cd'.repeat(32) as Hex

// A profile whose name trips the synthetic suppressed-name pair.
const profile = (pubkey: Hex, name: string): NostrEvent => ({
  id: `0${pubkey.slice(0, 63)}`,
  pubkey,
  created_at: 1_800_000_000,
  kind: 0,
  tags: [],
  content: JSON.stringify({ name }),
  sig: '00'.repeat(64),
})

const note = (pubkey: Hex): NostrEvent => ({ ...profile(pubkey, ''), id: `1${pubkey.slice(0, 63)}`, kind: 1, content: 'hello' })

describe('an account signed in on this device', () => {
  const own = (pubkey: Hex): boolean => pubkey === READER

  it('keeps its own events when one of them trips a spam heuristic', () => {
    expect(rejectEvent(profile(READER, 'example placeholder'), undefined, undefined, own)).toBe(false)
  })

  it('is not learned as spam by that event', () => {
    rejectEvent(profile(READER, 'example placeholder'), undefined, undefined, own)
    expect(rejectEvent(note(READER), undefined, undefined, own)).toBe(false)
  })

  it('still drops a stranger with the same name', () => {
    expect(rejectEvent(profile(STRANGER, 'example placeholder'), undefined, undefined, own)).toBe(true)
  })
})
