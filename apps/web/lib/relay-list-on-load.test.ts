import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Hex } from '@nostrich/nostr'

const READER = 'ab'.repeat(32) as Hex

const published = vi.hoisted(() => ({ calls: [] as string[], answer: null as unknown }))
const pool = vi.hoisted(() => ({ setRelays: vi.fn() }))

vi.mock('./pool', () => ({ getPool: () => pool }))
vi.mock('./relay-list-import', () => ({
  fetchPublishedRelays: async (pubkey: string) => {
    published.calls.push(pubkey)
    return published.answer
  },
  fetchRelayList: async () => null,
  useImportedRelayList: () => undefined,
}))
vi.mock('../components/SessionProvider', () => ({
  useSession: () => ({ session: undefined }),
  sessionPubkey: () => undefined,
  sessionSigner: () => undefined,
}))

import { useStoredRelays } from './relay-apply'

const LIST = {
  urls: ['wss://relay-a.example', 'wss://relay-b.example'],
  updatedAt: 1_800_000_000,
  entries: [
    { url: 'wss://relay-a.example', policy: { read: true, write: true } },
    { url: 'wss://relay-b.example', policy: { read: true, write: false } },
  ],
}

function Host(): null {
  useStoredRelays()
  return null
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function render(): Promise<void> {
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(createElement(Host)))
}

const cookie = (): string => document.cookie

beforeEach(() => {
  published.calls.length = 0
  pool.setRelays.mockClear()
  document.cookie = 'nostrich_relays=; path=/; max-age=0'
  localStorage.setItem('nostrich.accounts', JSON.stringify({ accounts: [{ kind: 'nip07', pubkey: READER }], active: READER }))
})

describe("the reader's published relay list", () => {
  it('is asked for on load and handed to the pool, with no Settings screen mounted', async () => {
    published.answer = { found: LIST, answered: true }
    await render()
    await vi.waitFor(() => expect(pool.setRelays).toHaveBeenCalled())
    expect(published.calls).toEqual([READER])
    expect(cookie()).toContain('relay-a.example')
  })

  it('never replaces a list the reader edited on this device', async () => {
    document.cookie = `nostrich_relays=${encodeURIComponent(JSON.stringify({ urls: ['wss://mine.example'], src: 'edited' }))}; path=/`
    published.answer = { found: LIST, answered: true }
    await render()
    await vi.waitFor(() => expect(published.calls).toEqual([READER]))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(cookie()).not.toContain('relay-a.example')
  })

  it('is not asked for a reader nobody is signed in as', async () => {
    localStorage.removeItem('nostrich.accounts')
    await render()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(published.calls).toEqual([])
  })
})
