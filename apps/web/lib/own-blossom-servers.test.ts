import { describe, expect, it, vi } from 'vitest'
import type { Hex } from '@nostrich/nostr'

const READER = 'ab'.repeat(32) as Hex
const OTHER = 'cd'.repeat(32) as Hex

const outcome = vi.hoisted(() => ({ value: { events: [] as unknown[], answered: 0, attempted: 4 } }))
const asked = vi.hoisted(() => ({ filters: [] as unknown[] }))

vi.mock('./pool', () => ({
  getPool: () => ({
    readRelays: () => ['wss://read-a.example'],
    queryWithStatus: async (filters: unknown) => {
      asked.filters.push(filters)
      return outcome.value
    },
  }),
}))

import { ownBlossomServersQuery } from './own-blossom-servers'

const list = (pubkey: Hex, at: number, servers: string[]) => ({
  id: `${at}`.padStart(64, '0'),
  pubkey,
  created_at: at,
  kind: 10063,
  content: '',
  sig: '00'.repeat(64),
  tags: servers.map(server => ['server', server]),
})

describe("the reader's own media server list", () => {
  it('asks for that one author alone', async () => {
    outcome.value = { events: [], answered: 2, attempted: 4 }
    await ownBlossomServersQuery(READER).queryFn()
    expect(asked.filters[0]).toEqual([{ kinds: [10063], authors: [READER], limit: 1 }])
  })

  it("takes the newest of the reader's own lists and nobody else's", async () => {
    outcome.value = {
      events: [
        list(READER, 100, ['https://media-a.example']),
        list(READER, 200, ['https://media-a.example', 'https://media-b.example']),
        list(OTHER, 300, ['https://media-c.example']),
      ],
      answered: 3,
      attempted: 4,
    }
    expect(await ownBlossomServersQuery(READER).queryFn()).toEqual([
      'https://media-a.example',
      'https://media-b.example',
    ])
  })

  it('says "no list" only when a relay answered', async () => {
    outcome.value = { events: [], answered: 1, attempted: 4 }
    expect(await ownBlossomServersQuery(READER).queryFn()).toEqual([])
  })

  it('is an error when nobody answered', async () => {
    outcome.value = { events: [], answered: 0, attempted: 4 }
    await expect(ownBlossomServersQuery(READER).queryFn()).rejects.toThrow()
  })
})
