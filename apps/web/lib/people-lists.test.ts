import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventTemplate, NostrEvent, QueryOutcome } from '@nostrich/nostr'

const queryWithStatus = vi.fn<(...args: unknown[]) => Promise<QueryOutcome>>()
const publish = vi.fn<(event: NostrEvent, relays?: unknown) => Promise<{ relay: string; ok: boolean }[]>>()

vi.mock('./pool', () => ({
  getPool: () => ({ queryWithStatus, publish, readRelays: () => ['wss://relay-a.example'] }),
}))

const { applyListAction, PeopleListError } = await import('./people-lists')
const { parsePeopleList, parsePrivateTags } = await import('@nostrich/nostr')

const ME = 'a'.repeat(64)
const P = 'b'.repeat(64)
const Q = 'c'.repeat(64)
const R = 'd'.repeat(64)
const UUID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

const seal = (plaintext: string): string => `enc:${Buffer.from(plaintext).toString('base64')}`
const unseal = (ciphertext: string): string => Buffer.from(ciphertext.slice(4), 'base64').toString()

function makeSigner() {
  let n = 0
  return {
    kind: 'privatekey' as const,
    getPublicKey: async () => ME,
    signEvent: vi.fn(async (template: EventTemplate): Promise<NostrEvent> => ({
      ...template,
      pubkey: ME,
      id: (++n).toString(16).padStart(64, '0'),
      sig: '0'.repeat(128),
    })),
    nip44Encrypt: vi.fn(async (_peer: string, plaintext: string) => seal(plaintext)),
    nip44Decrypt: vi.fn(async (_peer: string, ciphertext: string) => unseal(ciphertext)),
  }
}

function listEvent(tags: string[][], content = '', createdAt = 1_000): NostrEvent {
  return { id: 'f'.repeat(64), pubkey: ME, created_at: createdAt, kind: 30000, tags: [['d', UUID], ...tags], content, sig: '0'.repeat(128) }
}

function snapshot(event: NostrEvent, privateTags: string[][] | undefined, reachable = true) {
  return { entries: [{ list: parsePeopleList(event)!, privateTags }], reachable }
}

const ADDRESS = `30000:${ME}:${UUID}`
// Each write goes to the reader's relays and the list relays, so one event is two calls.
const published = (): NostrEvent[] => [...new Map(publish.mock.calls.map(call => [call[0].id, call[0]])).values()]

beforeEach(() => {
  queryWithStatus.mockReset()
  queryWithStatus.mockResolvedValue({ events: [], answered: 1, attempted: 1 })
  publish.mockReset()
  publish.mockResolvedValue([{ relay: 'wss://relay-a.example', ok: true }])
})

describe('a public change', () => {
  it('adds a member to a public list without touching encryption or any other tag', async () => {
    const signer = makeSigner()
    const cached = snapshot(listEvent([['title', 'Friends'], ['description', 'kept'], ['p', P, 'wss://hint.example', 'pet']]), [])
    await applyListAction(signer as never, ME, cached, { type: 'toggle', address: ADDRESS, pubkey: R, add: true })
    const [event] = published()
    expect(event!.tags).toEqual([['d', UUID], ['title', 'Friends'], ['description', 'kept'], ['p', P, 'wss://hint.example', 'pet'], ['p', R]])
    expect(signer.nip44Encrypt).not.toHaveBeenCalled()
    expect(signer.nip44Decrypt).not.toHaveBeenCalled()
  })

  it('renames a list whose private half is shut and carries that half byte for byte', async () => {
    const signer = makeSigner()
    const cached = snapshot(listEvent([['title', 'Friends'], ['p', P]], 'OPAQUE-CIPHERTEXT'), undefined)
    await applyListAction(signer as never, ME, cached, { type: 'edit', address: ADDRESS, title: 'Close friends', members: [P], privacy: 'mixed' })
    const [event] = published()
    expect(event!.content).toBe('OPAQUE-CIPHERTEXT')
    expect(event!.tags).toContainEqual(['title', 'Close friends'])
    expect(signer.nip44Decrypt).not.toHaveBeenCalled()
  })
})

describe('the private half', () => {
  it('refuses a private add when the half will not open, and signs nothing', async () => {
    const signer = makeSigner()
    signer.nip44Decrypt.mockRejectedValue(new Error('User rejected'))
    const cached = snapshot(listEvent([['title', 'Test']], seal(JSON.stringify([['p', Q]]))), undefined)
    await expect(applyListAction(signer as never, ME, cached, { type: 'toggle', address: ADDRESS, pubkey: R, add: true })).rejects.toBeInstanceOf(
      PeopleListError,
    )
    expect(signer.signEvent).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
  })

  it('adds to a private list in its private half and keeps what else it held', async () => {
    const signer = makeSigner()
    const half = [['p', Q, 'wss://hint.example'], ['t', 'bitcoin']]
    const cached = snapshot(listEvent([['title', 'Test']], seal(JSON.stringify(half))), undefined)
    await applyListAction(signer as never, ME, cached, { type: 'toggle', address: ADDRESS, pubkey: R, add: true })
    const [event] = published()
    expect(event!.tags.some(tag => tag[0] === 'p')).toBe(false)
    expect(parsePrivateTags(unseal(event!.content))).toEqual([...half, ['p', R]])
  })

  it('keeps a private list private when its last member leaves', async () => {
    const signer = makeSigner()
    const cached = snapshot(listEvent([['title', 'Test']], seal(JSON.stringify([['p', Q]]))), [['p', Q]])
    await applyListAction(signer as never, ME, cached, { type: 'toggle', address: ADDRESS, pubkey: Q, add: false })
    const [event] = published()
    expect(event!.content).not.toBe('')
    expect(parsePrivateTags(unseal(event!.content))).toEqual([])
    expect(parsePeopleList(event!)!.hasPrivate).toBe(true)
  })

  it('refuses a signer that hands back the plaintext as "ciphertext"', async () => {
    const signer = makeSigner()
    signer.nip44Encrypt.mockImplementation(async (_peer: string, plaintext: string) => plaintext)
    const cached = snapshot(listEvent([['title', 'Test']], seal('[]')), [])
    await expect(applyListAction(signer as never, ME, cached, { type: 'toggle', address: ADDRESS, pubkey: R, add: true })).rejects.toMatchObject({
      code: 'encrypt',
    })
    expect(publish).not.toHaveBeenCalled()
  })
})

describe('the Private switch', () => {
  it('makes a list public: members out, private-only tags stay private', async () => {
    const signer = makeSigner()
    const half = [['p', Q], ['t', 'bitcoin']]
    const cached = snapshot(listEvent([['title', 'Test'], ['p', P]], seal(JSON.stringify(half))), half)
    await applyListAction(signer as never, ME, cached, { type: 'edit', address: ADDRESS, title: 'Test', members: [P, Q], privacy: 'public' })
    const [event] = published()
    expect(event!.tags.filter(tag => tag[0] === 'p').map(tag => tag[1])).toEqual([P, Q])
    expect(parsePrivateTags(unseal(event!.content))).toEqual([['t', 'bitcoin']])
  })

  it('makes a list private: every member encrypted, none left as a p tag', async () => {
    const signer = makeSigner()
    const cached = snapshot(listEvent([['title', 'Test'], ['p', P, 'wss://hint.example']]), [])
    await applyListAction(signer as never, ME, cached, { type: 'edit', address: ADDRESS, title: 'Test', members: [P, R], privacy: 'private' })
    const [event] = published()
    expect(event!.tags.some(tag => tag[0] === 'p')).toBe(false)
    expect(parsePrivateTags(unseal(event!.content))).toEqual([['p', R], ['p', P, 'wss://hint.example']])
  })

  it('leaves a mixed list mixed until the reader picks a side', async () => {
    const signer = makeSigner()
    const cached = snapshot(listEvent([['title', 'Test'], ['p', P]], seal(JSON.stringify([['p', Q]]))), [['p', Q]])
    await applyListAction(signer as never, ME, cached, { type: 'edit', address: ADDRESS, title: 'Test', members: [P, Q, R], privacy: 'mixed' })
    const [event] = published()
    expect(event!.tags.filter(tag => tag[0] === 'p').map(tag => tag[1])).toEqual([P])
    expect(parsePrivateTags(unseal(event!.content))).toEqual([['p', Q], ['p', R]])
  })
})

describe('the read gate and the fresh copy', () => {
  it('writes nothing while no relay answered the read', async () => {
    const signer = makeSigner()
    const cached = snapshot(listEvent([['title', 'Test']]), [], false)
    await expect(applyListAction(signer as never, ME, cached, { type: 'toggle', address: ADDRESS, pubkey: R, add: true })).rejects.toMatchObject({
      code: 'unreachable',
    })
    expect(signer.signEvent).not.toHaveBeenCalled()
  })

  it('applies the change to a newer copy written on another device', async () => {
    const signer = makeSigner()
    const cached = snapshot(listEvent([['title', 'Test'], ['p', P]], '', 1_000), [])
    const newer = { ...listEvent([['title', 'Test'], ['p', P], ['p', Q]], '', 2_000), id: '1'.repeat(64) }
    queryWithStatus.mockResolvedValue({ events: [newer], answered: 1, attempted: 1 })
    await applyListAction(signer as never, ME, cached, { type: 'toggle', address: ADDRESS, pubkey: R, add: true })
    const [event] = published()
    expect(event!.tags.filter(tag => tag[0] === 'p').map(tag => tag[1])).toEqual([P, Q, R])
    expect(event!.created_at).toBeGreaterThan(2_000)
  })
})

describe('creating and deleting', () => {
  it('creates a private list with its title first and its members sealed', async () => {
    const signer = makeSigner()
    await applyListAction(signer as never, ME, { entries: [], reachable: false }, { type: 'create', title: 'Close', members: [P], private: true })
    const [event] = published()
    expect(event!.tags[0]![0]).toBe('d')
    expect(event!.tags[1]).toEqual(['title', 'Close'])
    expect(event!.tags.some(tag => tag[0] === 'p')).toBe(false)
    expect(parsePrivateTags(unseal(event!.content))).toEqual([['p', P]])
  })

  it('empties the list and then deletes it by id and address', async () => {
    const signer = makeSigner()
    const cached = snapshot(listEvent([['title', 'Test'], ['p', P]], seal('[]')), [])
    await applyListAction(signer as never, ME, cached, { type: 'delete', address: ADDRESS })
    const [stub, deletion] = published()
    expect(stub!.tags).toEqual([['d', UUID]])
    expect(stub!.content).toBe('')
    expect(deletion!.kind).toBe(5)
    expect(deletion!.tags).toContainEqual(['a', ADDRESS])
    expect(deletion!.tags).toContainEqual(['k', '30000'])
    expect(deletion!.tags.filter(tag => tag[0] === 'e')).toHaveLength(2)
  })
})
