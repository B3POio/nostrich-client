import { describe, expect, it } from 'vitest'
import type { EmojiPack } from '@nostrich/nostr'

import { distinctPacks, packFingerprint } from './emoji-packs'

function pack(address: string, title: string, urls: string[]): EmojiPack {
  return {
    address,
    pubkey: address.split(':')[1] ?? '',
    identifier: address.split(':')[2] ?? '',
    title,
    untitled: false,
    emoji: urls.map((url, i) => ({ shortcode: `e${i}`, url, pack: address })),
    dropped: 0,
    event: { id: address, pubkey: '', created_at: 0, kind: 30030, tags: [], content: '', sig: '' },
  }
}

const range = (n: number, prefix = 'u'): string[] => Array.from({ length: n }, (_, i) => `https://x.test/${prefix}${i}.png`)

describe('the Emoji Packs shelf shows each pack once', () => {
  it('drops a second address that holds the same pictures', () => {
    const a = pack('30030:7a185bba:imported', 'Imported pack', range(97))
    const b = pack('30030:813befc7:imported', 'Imported pack', range(97))
    expect(distinctPacks([a, b]).map(p => p.address)).toEqual([a.address])
  })

  it('catches it whatever the title, because a pack is its pictures', () => {
    const a = pack('30030:aa:one', 'Some pack', range(5))
    const b = pack('30030:bb:two', 'Totally different name', range(5))
    expect(distinctPacks([a, b])).toHaveLength(1)
  })

  it('catches it whatever order the pictures were published in', () => {
    const a = pack('30030:aa:one', 'X', range(5))
    const b = pack('30030:bb:two', 'X', [...range(5)].reverse())
    expect(packFingerprint(a)).toBe(packFingerprint(b))
    expect(distinctPacks([a, b])).toHaveLength(1)
  })

  it('collapses twenty-six copies of one single-emoji pack to one card', () => {
    const copies = Array.from({ length: 26 }, (_, i) => pack(`30030:k${i}:single`, 'Single', range(1)))
    expect(distinctPacks(copies)).toHaveLength(1)
  })

  it('keeps the more complete version of the same pack', () => {
    const small = pack('30030:aa:poke', 'Monsters', range(992))
    const large = pack('30030:bb:poke', 'Monsters', range(1008))
    expect(distinctPacks([small, large]).map(p => p.address)).toEqual([large.address])
    expect(distinctPacks([large, small]).map(p => p.address)).toEqual([large.address])
  })

  it('never merges unrelated packs that merely share a common name', () => {
    const a = pack('30030:aa:p', 'Pepe', range(3, 'a'))
    const b = pack('30030:bb:p', 'Pepe', range(14, 'b'))
    const c = pack('30030:cc:p', 'Pepe', range(1, 'c'))
    expect(distinctPacks([a, b, c])).toHaveLength(3)
  })

  it('does not offer a twin of something the reader already owns', () => {
    const mine = pack('30030:aa:x', 'Épico emoji', range(7))
    const twin = pack('30030:bb:x', 'Épico emoji', range(7))
    expect(distinctPacks([twin], [mine])).toEqual([])
  })

  it('does not offer a near-twin of something owned either, even a larger one', () => {
    const mine = pack('30030:aa:x', 'Music', range(8))
    const larger = pack('30030:bb:x', 'Music', range(9))
    expect(distinctPacks([larger], [mine])).toEqual([])
  })

  it('keeps shelf order: the copy the reader was looking at stays where it was', () => {
    const first = pack('30030:aa:1', 'A', range(3, 'a'))
    const dupe = pack('30030:bb:1', 'A', range(3, 'a'))
    const other = pack('30030:cc:2', 'B', range(3, 'b'))
    expect(distinctPacks([first, other, dupe]).map(p => p.address)).toEqual([first.address, other.address])
  })

  it('never treats empty packs as duplicates of each other', () => {
    const a = pack('30030:aa:e', 'Empty one', [])
    const b = pack('30030:bb:e', 'Empty two', [])
    expect(distinctPacks([a, b])).toHaveLength(2)
  })
})
