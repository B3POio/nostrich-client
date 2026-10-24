import { describe, expect, it } from 'vitest'
import { parseEmojiPack, type EmojiPack, type NostrEvent } from '@nostrich/nostr'

import { matchesPackQuery, rankPackMatches } from './emoji-packs'

const AUTHOR = 'a'.repeat(64)
const IMAGE = 'https://cdn.example.com/a.png'

function pack(identifier: string, title: string, codes: string[], description?: string): EmojiPack {
  const event: NostrEvent = {
    id: '0'.repeat(64),
    pubkey: AUTHOR,
    created_at: 1_783_000_000,
    kind: 30030,
    tags: [
      ['d', identifier],
      ['title', title],
      ...(description === undefined ? [] : [['description', description]]),
      ...codes.map(code => ['emoji', code, `${IMAGE}?${code}`]),
    ],
    content: '',
    sig: '0'.repeat(128),
  }
  const parsed = parseEmojiPack(event)
  if (parsed === undefined) throw new Error('fixture is not a pack')
  return parsed
}

const frogs = pack('frogs-2024', 'Swamp friends', ['pepe', 'pepe_sad', 'toad'], 'green things')
const bitcoin = pack('btc', 'The Bitcoin Army', ['laser_eyes', 'hodl'])

describe('rankPackMatches', () => {
  it('puts the pack named for the word above one that merely holds it', () => {
    const named = pack('pepe-pack', 'Pepe', ['frog'])
    const holder = pack('misc', 'Assorted', ['pepe_sad'])
    expect(rankPackMatches([holder, named], 'pepe').map(item => item.title)).toEqual(['Pepe', 'Assorted'])
  })

  it('leaves the caller’s order alone when nothing is named', () => {
    const one = pack('a', 'Assorted', ['pepe'])
    const two = pack('b', 'Other', ['pepe_sad'])
    expect(rankPackMatches([one, two], 'pepe').map(item => item.identifier)).toEqual(['a', 'b'])
    expect(rankPackMatches([one, two], '').map(item => item.identifier)).toEqual(['a', 'b'])
  })
})

describe('matchesPackQuery', () => {
  it('finds a pack by a shortcode it holds, not just by its name', () => {
    expect(matchesPackQuery(frogs, 'pepe')).toBe(true)
    expect(matchesPackQuery(bitcoin, 'pepe')).toBe(false)
  })

  it('finds it by title, identifier or description', () => {
    expect(matchesPackQuery(frogs, 'swamp')).toBe(true)
    expect(matchesPackQuery(frogs, 'frogs-2024')).toBe(true)
    expect(matchesPackQuery(frogs, 'green')).toBe(true)
  })

  it('narrows on a second word rather than widening', () => {
    expect(matchesPackQuery(frogs, 'swamp pepe')).toBe(true)
    expect(matchesPackQuery(frogs, 'swamp laser')).toBe(false)
  })

  it('ignores case and surrounding space, and an empty query matches everything', () => {
    expect(matchesPackQuery(bitcoin, '  BITCOIN  ')).toBe(true)
    expect(matchesPackQuery(bitcoin, '')).toBe(true)
    expect(matchesPackQuery(bitcoin, '   ')).toBe(true)
  })
})
