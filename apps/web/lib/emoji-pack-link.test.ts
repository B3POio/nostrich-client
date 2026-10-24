import { describe, expect, it } from 'vitest'
import { encodeNaddr, type Hex } from '@nostrich/nostr'

import { parsePackLink } from './emoji-pack-link'

/** What people actually paste. */

const AUTHOR = 'a'.repeat(64) as Hex
const naddr = encodeNaddr({ kind: 30030, pubkey: AUTHOR, identifier: 'faces', relays: ['wss://relay.example.com'] })

describe('parsePackLink', () => {
  it('takes a bare naddr and keeps its relay hints', () => {
    expect(parsePackLink(naddr)).toEqual({
      address: `30030:${AUTHOR}:faces`,
      relays: ['wss://relay.example.com'],
    })
  })

  it('takes the nostr: form and one inside a url or a sentence', () => {
    expect(parsePackLink(`nostr:${naddr}`)?.address).toBe(`30030:${AUTHOR}:faces`)
    expect(parsePackLink(`https://packs.example/a/${naddr}`)?.address).toBe(`30030:${AUTHOR}:faces`)
    expect(parsePackLink(`look at this pack ${naddr} it is good`)?.address).toBe(`30030:${AUTHOR}:faces`)
  })

  it('takes a raw coordinate', () => {
    expect(parsePackLink(`30030:${AUTHOR}:my-pack`)).toEqual({
      address: `30030:${AUTHOR}:my-pack`,
      relays: [],
    })
  })

  it('refuses a pointer to something that is not a pack', () => {
    const article = encodeNaddr({ kind: 30023, pubkey: AUTHOR, identifier: 'an-article', relays: [] })
    expect(parsePackLink(article)).toBeUndefined()
    expect(parsePackLink(`30023:${AUTHOR}:an-article`)).toBeUndefined()
  })

  it('refuses nonsense without throwing', () => {
    expect(parsePackLink('')).toBeUndefined()
    expect(parsePackLink('naddr1truncated')).toBeUndefined()
    expect(parsePackLink('hello')).toBeUndefined()
  })
})
