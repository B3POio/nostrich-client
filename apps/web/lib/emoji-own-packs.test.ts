import { describe, expect, it } from 'vitest'
import { buildEmojiSelection, parseEmojiPack, type EmojiPack, type NostrEvent } from '@nostrich/nostr'

import { EMPTY_EMOJI_SET, packToggled, withOwnPacks, type EmojiSetSnapshot } from './emoji-packs'

const READER = 'b'.repeat(64)
const OTHER = 'c'.repeat(64)
const IMAGE = 'https://cdn.example.com/a.png'

function packOf(author: string, identifier: string, codes: string[], at = 1_783_000_000): EmojiPack {
  const event: NostrEvent = {
    id: identifier.padEnd(64, '0').slice(0, 64).replace(/[^0-9a-f]/g, '0'),
    pubkey: author,
    created_at: at,
    kind: 30030,
    tags: [['d', identifier], ['title', identifier], ...codes.map(code => ['emoji', code, `${IMAGE}?${identifier}-${code}`])],
    content: '',
    sig: '0'.repeat(128),
  }
  const parsed = parseEmojiPack(event)
  if (parsed === undefined) throw new Error('fixture is not a pack')
  return parsed
}

const monero = packOf(OTHER, 'monero', ['monero', 'pirate'])
const mine = packOf(READER, 'mypack', ['burger', 'wave'])
const listed = { packs: [{ address: monero.address }], loose: [] }

describe('the reader’s own packs', () => {
  it('draws their own pack after the list’s packs, though the list does not name it', () => {
    const { selection, shown } = withOwnPacks(listed, new Map([[monero.address, monero]]), new Map([[mine.address, mine]]))
    expect(selection.packs.map(ref => ref.address)).toEqual([monero.address, mine.address])
    expect(shown.get(mine.address)?.title).toBe('mypack')
  })

  it('puts the emoji in the set every picker and composer reads, and never on the list', () => {
    const cached: EmojiSetSnapshot = {
      ...EMPTY_EMOJI_SET,
      selection: listed,
      packs: new Map([[monero.address, monero]]),
      own: new Map([[mine.address, mine]]),
      reachable: true,
    }
    const other = packOf(OTHER, 'cats', ['cat'])
    const next = packToggled(cached, other, true)
    expect(next.index.has('wave')).toBe(true)
    expect(next.index.has('burger')).toBe(true)
    expect(next.selection.packs.map(ref => ref.address)).not.toContain(mine.address)
    const written = buildEmojiSelection({ selection: next.selection, previous: undefined })
    expect(written.tags.some(tag => tag[0] === 'a' && tag[1] === mine.address)).toBe(false)
    expect(next.packs.has(mine.address)).toBe(false)
  })

  it('does not draw an own pack twice when the list already names it', () => {
    const both = { packs: [{ address: mine.address }], loose: [] }
    const { selection } = withOwnPacks(both, new Map([[mine.address, mine]]), new Map([[mine.address, mine]]))
    expect(selection.packs).toHaveLength(1)
  })
})
