import { describe, expect, it } from 'vitest'
import { parseEmojiPack, type EmojiPack, type NostrEvent } from '@nostrich/nostr'

import { EMPTY_EMOJI_SET, packToggled, type EmojiSetSnapshot } from './emoji-packs'

const AUTHOR = 'a'.repeat(64)
const IMAGE = 'https://cdn.example.com/a.png'

function packOf(identifier: string, codes: string[]): EmojiPack {
  const event: NostrEvent = {
    id: '0'.repeat(64),
    pubkey: AUTHOR,
    created_at: 1_783_000_000,
    kind: 30030,
    tags: [['d', identifier], ['title', identifier], ...codes.map(code => ['emoji', code, `${IMAGE}?${code}`])],
    content: '',
    sig: '0'.repeat(128),
  }
  const parsed = parseEmojiPack(event)
  if (parsed === undefined) throw new Error('fixture is not a pack')
  return parsed
}

const faces = packOf('faces', ['pepe', 'wave'])
const reachable: EmojiSetSnapshot = { ...EMPTY_EMOJI_SET, reachable: true }

describe('packToggled', () => {
  it('shows the pack’s emoji in the same frame as the button', () => {
    const next = packToggled(reachable, faces, true)
    expect(next.selection.packs).toEqual([{ address: faces.address }])
    expect(next.emoji.map(item => item.shortcode)).toEqual(['pepe', 'wave'])
    expect(next.index.get('pepe')?.url).toBe(`${IMAGE}?pepe`)
  })

  it('takes them away again, emoji and all', () => {
    const added = packToggled(reachable, faces, true)
    const removed = packToggled(added, faces, false)
    expect(removed.selection.packs).toEqual([])
    expect(removed.emoji).toEqual([])
    expect(removed.packs.has(faces.address)).toBe(false)
  })

  it('keeps the relay a pasted link came with', () => {
    const next = packToggled(reachable, faces, true, 'wss://relay.example.com')
    expect(next.selection.packs).toEqual([{ address: faces.address, relay: 'wss://relay.example.com' }])
  })

  it('does not invent an answer about relays it never heard from', () => {
    expect(packToggled(EMPTY_EMOJI_SET, faces, true).reachable).toBe(false)
    expect(packToggled(reachable, faces, true).reachable).toBe(true)
  })

  it('leaves the event alone, because the event is what the next save builds on', () => {
    const held: EmojiSetSnapshot = { ...reachable, event: { ...faces.event, kind: 10030 } }
    expect(packToggled(held, faces, true).event).toBe(held.event)
  })
})
