import { describe, expect, it } from 'vitest'

import {
  FOLLOW_PACK_KIND,
  FOLLOW_SET_KIND,
  buildPeopleList,
  emptiedPeopleList,
  isDeletionStub,
  isRandomIdentifier,
  isShownList,
  isSystemList,
  listPrivacy,
  membersOf,
  moveMembers,
  newestPeopleLists,
  parsePeopleList,
  withMember,
  withTitle,
  withoutMember,
} from './people-lists'
import { parsePrivateTags, privateTagsPlaintext } from './private-tags'
import type { NostrEvent } from './types'

const ME = 'a'.repeat(64)
const P = 'b'.repeat(64)
const Q = 'c'.repeat(64)
const R = 'd'.repeat(64)
const UUID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const CIPHERTEXT = 'AkQ2dGhpc2lzbm90cmVhbGx5bmlwNDRidXRpdGRvZXNub3RtYXR0ZXJoZXJl'

function event(partial: Partial<NostrEvent> & { tags: string[][] }): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey: ME,
    created_at: 1_000,
    kind: FOLLOW_SET_KIND,
    content: '',
    sig: '0'.repeat(128),
    ...partial,
  }
}

const PRIVATE_ONLY = event({ tags: [['d', UUID], ['title', 'Test'], ['client', 'Example App']], content: CIPHERTEXT })

/** A mixed list with everything a rebuild would lose. */
const MIXED = event({
  tags: [
    ['d', UUID],
    ['title', 'Friends'],
    ['description', 'people I read'],
    ['image', 'https://example.com/cover.png'],
    ['p', P, 'wss://relay.example', 'pet'],
    ['alt', 'List of people'],
  ],
  content: CIPHERTEXT,
})

describe('parsePrivateTags', () => {
  it('reads an empty half as empty and a broken one as unreadable, never the same answer', () => {
    expect(parsePrivateTags('')).toEqual([])
    expect(parsePrivateTags('   ')).toEqual([])
    expect(parsePrivateTags('not json')).toBeUndefined()
    expect(parsePrivateTags('{"p":1}')).toBeUndefined()
  })

  it('keeps well-formed tags and drops malformed ones', () => {
    expect(parsePrivateTags(JSON.stringify([['p', Q], ['t', 'bitcoin'], [1, 2], [], 'x']))).toEqual([
      ['p', Q],
      ['t', 'bitcoin'],
    ])
  })

  it('round-trips through the plaintext it encrypts', () => {
    const tags = [['p', Q, 'wss://hint.example'], ['t', 'nostr']]
    expect(parsePrivateTags(privateTagsPlaintext(tags))).toEqual(tags)
  })
})

describe('parsePeopleList', () => {
  it('reads a private-only list made in another app', () => {
    const list = parsePeopleList(PRIVATE_ONLY)!
    expect(list.title).toBe('Test')
    expect(list.publicMembers).toEqual([])
    expect(list.hasPrivate).toBe(true)
    expect(list.address).toBe(`30000:${ME}:${UUID}`)
    expect(listPrivacy(list)).toBe('private')
  })

  it('names a list by title, then name, then a d that reads as a word, else nothing', () => {
    expect(parsePeopleList(event({ tags: [['d', 'x'], ['name', 'Old name']] }))!.title).toBe('Old name')
    expect(parsePeopleList(event({ tags: [['d', 'bitcoin-devs']] }))!.title).toBe('bitcoin-devs')
    expect(parsePeopleList(event({ tags: [['d', UUID]] }))!.title).toBeUndefined()
    expect(parsePeopleList(event({ tags: [['d', 'V1StGXR8Z5jdHi6BmyT']] }))!.title).toBeUndefined()
    expect(parsePeopleList(event({ tags: [['d', 'x'], ['title', '  '], ['name', 'Fallback']] }))!.title).toBe('Fallback')
  })

  it('validates, lowercases and deduplicates members in their own order', () => {
    const list = parsePeopleList(event({ tags: [['d', 'x'], ['p', Q], ['p', P.toUpperCase()], ['p', 'npub1nothex'], ['p', Q]] }))!
    expect(list.publicMembers).toEqual([Q, P])
  })

  it('reads a follow pack as public, whatever its content says', () => {
    const pack = parsePeopleList(event({ kind: FOLLOW_PACK_KIND, tags: [['d', 'pack'], ['p', P]], content: 'x' }))!
    expect(pack.hasPrivate).toBe(false)
    expect(listPrivacy(pack)).toBe('public')
  })

  it('refuses other kinds', () => {
    expect(parsePeopleList(event({ kind: 30003, tags: [['d', 'x']] }))).toBeUndefined()
  })
})

describe('which lists are shown', () => {
  it('never shows another app’s machinery', () => {
    expect(isSystemList(parsePeopleList(event({ tags: [['d', 'mute'], ['p', P]] }))!)).toBe(true)
    expect(isSystemList(parsePeopleList(event({ tags: [['d', 'mutelists']] }))!)).toBe(true)
    expect(isShownList(parsePeopleList(event({ tags: [['d', 'mute'], ['p', P]] }))!)).toBe(false)
    expect(isSystemList(parsePeopleList(event({ kind: FOLLOW_PACK_KIND, tags: [['d', 'mute']] }))!)).toBe(false)
  })

  it('hides what a deletion leaves, and keeps a named list that has nobody in it yet', () => {
    expect(isDeletionStub(parsePeopleList(event({ tags: [['d', UUID]] }))!)).toBe(true)
    expect(isDeletionStub(parsePeopleList(event({ tags: [['d', UUID], ['title', 'New']] }))!)).toBe(false)
    expect(isDeletionStub(parsePeopleList(PRIVATE_ONLY)!)).toBe(false)
  })
})

describe('newestPeopleLists', () => {
  it('keeps the newest version per address, and the lower id on a tie', () => {
    const old = event({ id: '1'.repeat(64), created_at: 1, tags: [['d', 'x'], ['title', 'old']] })
    const tieHigh = event({ id: '9'.repeat(64), created_at: 5, tags: [['d', 'x'], ['title', 'high']] })
    const tieLow = event({ id: '2'.repeat(64), created_at: 5, tags: [['d', 'x'], ['title', 'low']] })
    const lists = newestPeopleLists([old, tieHigh, tieLow])
    expect(lists).toHaveLength(1)
    expect(lists[0]!.title).toBe('low')
  })

  it('hides a list its author deleted, and shows one re-created after', () => {
    const list = event({ created_at: 10, tags: [['d', 'x'], ['title', 'gone']] })
    const address = `30000:${ME}:x`
    const deletion = event({ kind: 5, created_at: 20, tags: [['a', address], ['k', '30000']] })
    expect(newestPeopleLists([list, deletion])).toEqual([])
    const again = event({ id: '3'.repeat(64), created_at: 30, tags: [['d', 'x'], ['title', 'back']] })
    expect(newestPeopleLists([list, deletion, again])[0]?.title).toBe('back')
  })

  it('honours a deletion by id, and ignores one somebody else signed', () => {
    const list = event({ tags: [['d', 'x'], ['title', 'mine']] })
    expect(newestPeopleLists([list, event({ kind: 5, created_at: 2_000, tags: [['e', list.id]] })])).toEqual([])
    const stranger = event({ kind: 5, pubkey: P, created_at: 2_000, tags: [['a', `30000:${ME}:x`], ['e', list.id]] })
    expect(newestPeopleLists([list, stranger])).toHaveLength(1)
  })
})

describe('editing tags', () => {
  it('adds and removes a member without touching anything else', () => {
    const added = withMember(MIXED.tags, R)
    expect(added).toEqual([...MIXED.tags, ['p', R]])
    expect(withMember(added, R)).toEqual(added)
    expect(withoutMember(added, R)).toEqual(MIXED.tags)
    expect(withoutMember(MIXED.tags, P).some(tag => tag[0] === 'p')).toBe(false)
  })

  it('renames with one title and keeps an older name in step', () => {
    expect(withTitle([['d', 'x'], ['title', 'a'], ['title', 'b']], 'New')).toEqual([['d', 'x'], ['title', 'New']])
    expect(withTitle([['d', 'x'], ['name', 'Old']], 'New')).toEqual([['d', 'x'], ['name', 'New'], ['title', 'New']])
  })

  it('moves every member across for the Private switch, and nothing else', () => {
    const pub = [['title', 'Friends'], ['p', P, 'wss://relay.example', 'pet']]
    const priv = [['p', Q], ['t', 'bitcoin']]
    const toPrivate = moveMembers(pub, priv, true)
    expect(toPrivate.publicTags).toEqual([['title', 'Friends']])
    expect(toPrivate.privateTags).toEqual([['p', Q], ['t', 'bitcoin'], ['p', P, 'wss://relay.example', 'pet']])
    const toPublic = moveMembers(pub, priv, false)
    expect(toPublic.publicTags).toEqual([...pub, ['p', Q]])
    expect(toPublic.privateTags).toEqual([['t', 'bitcoin']])
  })

  it('knows a mixed list from either side', () => {
    const list = parsePeopleList(MIXED)!
    expect(listPrivacy(list)).toBe('mixed')
    expect(listPrivacy(list, [['p', Q]])).toBe('mixed')
    expect(listPrivacy(list, [['t', 'bitcoin']])).toBe('public')
    expect(membersOf([['p', Q]])).toEqual([Q])
  })
})

describe('buildPeopleList', () => {
  it('carries the private half byte for byte when only the public half changed', () => {
    const next = buildPeopleList({ identifier: UUID, tags: withMember(MIXED.tags, R), privateHalf: 'carry', previous: MIXED, createdAt: 900 })
    expect(next.content).toBe(CIPHERTEXT)
    expect(next.created_at).toBe(1_001)
  })

  it('writes d exactly once and first, and never the old client tag', () => {
    const next = buildPeopleList({ identifier: UUID, tags: PRIVATE_ONLY.tags, privateHalf: 'carry', previous: PRIVATE_ONLY })
    expect(next.tags[0]).toEqual(['d', UUID])
    expect(next.tags.filter(tag => tag[0] === 'd')).toHaveLength(1)
    expect(next.tags.some(tag => tag[0] === 'client')).toBe(false)
    expect(next.tags).toContainEqual(['title', 'Test'])
  })

  it('writes the new ciphertext, or an empty half as empty', () => {
    expect(buildPeopleList({ identifier: 'x', tags: [], privateHalf: { ciphertext: 'sealed' } }).content).toBe('sealed')
    expect(buildPeopleList({ identifier: 'x', tags: [], privateHalf: { ciphertext: '' }, previous: MIXED }).content).toBe('')
  })

  it('never gives a follow pack a private half', () => {
    const pack = event({ kind: FOLLOW_PACK_KIND, tags: [['d', 'pack'], ['p', P]], content: 'stray' })
    expect(buildPeopleList({ identifier: 'pack', tags: pack.tags, privateHalf: 'carry', previous: pack }).content).toBe('')
  })

  it('empties a list for deletion down to its d', () => {
    const stub = emptiedPeopleList(MIXED)
    expect(stub.tags).toEqual([['d', UUID]])
    expect(stub.content).toBe('')
    expect(stub.kind).toBe(FOLLOW_SET_KIND)
  })
})

describe('isRandomIdentifier', () => {
  it('tells an id from a name', () => {
    expect(isRandomIdentifier(UUID)).toBe(true)
    expect(isRandomIdentifier('V1StGXR8Z5jdHi6BmyT')).toBe(true)
    expect(isRandomIdentifier('bitcoin-developers')).toBe(false)
    expect(isRandomIdentifier('friends2024')).toBe(false)
  })
})
