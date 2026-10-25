import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { Hex, NostrEvent } from '@nostrich/nostr'

/** The Replies tab on Home: what the people you follow answer, each reply under the note it answers. */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cache = new Map<string, NostrEvent>()
const query = vi.fn<(filters: { ids: string[] }[]) => Promise<NostrEvent[]>>()

const finished = { value: true }
const asked: string[][] = []
vi.mock('./pool', () => ({
  getPool: () => ({
    readRelays: () => ['wss://mine.example'],
    queryWithStatus: async (filters: { ids: string[] }[], relays: string[]) => {
      asked.push(relays)
      const events = await query(filters)
      return { events, answered: finished.value ? 4 : 2, attempted: 4 }
    },
  }),
}))
vi.mock('./event-cache', () => ({
  getCachedEvent: (id: string) => cache.get(id),
  rememberEvents: (events: NostrEvent[]) => {
    for (const event of events) cache.set(event.id, event)
  },
}))
vi.mock('./deleted', () => ({ isDeleted: () => false }))

const { useParentLookup } = await import('./parents')
const { isReplyRow, resolveTab, tabFromParam } = await import('./feed-tab')

const hex = (c: string): Hex => c.repeat(64) as Hex
const FOLLOWED = hex('b')
const STRANGER = hex('c')

function note(id: string, over: Partial<NostrEvent> = {}): NostrEvent {
  return { id: hex(id), pubkey: FOLLOWED, created_at: 1, kind: 1, content: 'hi', tags: [], sig: '', ...over } as NostrEvent
}
const replyTo = (id: string, parent: string): NostrEvent =>
  note(id, { tags: [['e', hex(parent), '', 'reply'], ['p', STRANGER]] })

type Lookup = { parents: Map<Hex, NostrEvent>; waiting: Set<Hex>; missing: Set<Hex> }

/** Renders the hook over `rows` and hands back its latest answer, with a way to change the rows. */
async function mount(rows: NostrEvent[]): Promise<{
  last: () => Lookup
  set: (next: NostrEvent[]) => Promise<void>
  unmount: () => Promise<void>
}> {
  let answer: Lookup | undefined
  let setRows: (next: NostrEvent[]) => void = () => undefined
  function Probe(): null {
    const [current, set] = useState(rows)
    setRows = set
    answer = useParentLookup(current)
    return null
  }
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(createElement(Probe)))
  return {
    last: () => answer as Lookup,
    set: async next => act(async () => setRows(next)),
    unmount: async () => act(async () => root.unmount()),
  }
}

function reset(): void {
  cache.clear()
  query.mockReset()
  asked.length = 0
  finished.value = true
}

const screen = readFileSync(join(__dirname, '..', 'components', 'FeedScreen.tsx'), 'utf8')

describe('the tab', () => {
  it('is an address of its own, for a signed-in reader only', () => {
    expect(tabFromParam('replies')).toBe('replies')
    const ask = { requested: 'replies' as const, customMissing: false, hasFollows: true }
    expect(resolveTab({ ...ask, signedIn: true })).toBe('replies')
    expect(resolveTab({ ...ask, signedIn: false })).not.toBe('replies')
  })

  it("sits right under Latest in the picker, and asks the reader's follows with replies kept", () => {
    expect(screen).toContain("[{ id: 'latest', label: 'Latest' }, { id: 'replies', label: 'Replies' }, ...windows]")
    expect(screen).toContain("return { kind: 'authors', authors: [...stableAuthors], include: 'all' }")
  })
})

describe('replies only', () => {
  it('is a reply, never a plain post, a quote, a repost or an article', () => {
    expect(isReplyRow(replyTo('1', '9'))).toBe(true)
    expect(isReplyRow(note('3'))).toBe(false)
    expect(isReplyRow(note('4', { tags: [['e', hex('9'), '', 'mention'], ['q', hex('9')]] }))).toBe(false)
    expect(isReplyRow(note('5', { kind: 6, tags: [['e', hex('9')]] }))).toBe(false)
    expect(isReplyRow(note('7', { kind: 30023, tags: [['d', 'x']] }))).toBe(false)
  })

  it('filters the rows AND the pile behind the pill, so the pill never promises a plain post', () => {
    expect(screen).toContain('repliesOnly ? gatedNotes.filter(isReplyRow) : EMPTY_NOTES')
    expect(screen).toContain('gate.accepts(note) && (!repliesOnly || isReplyRow(note))')
  })

  it('leaves out a reply whose note is nowhere, or whose note is by a muted account', () => {
    expect(screen).toContain('return parent !== undefined && !hidden.has(parent.pubkey)')
  })
})

describe('the note each reply answers', () => {
  it('holds a reply until its note is here, then hands the note over', async () => {
    reset()
    let answer: (events: NostrEvent[]) => void = () => undefined
    query.mockImplementation(() => new Promise(resolve => (answer = resolve)))
    const reply = replyTo('1', '9')
    const view = await mount([reply])
    expect(view.last().waiting.has(reply.id)).toBe(true)
    expect(view.last().parents.size).toBe(0)

    await act(async () => answer([note('9', { pubkey: STRANGER })]))
    expect(view.last().waiting.size).toBe(0)
    // The note answered may be by somebody the reader does not follow, and is drawn all the same.
    expect(view.last().parents.get(reply.id)?.pubkey).toBe(STRANGER)
    await view.unmount()
  })

  it('says a reply is missing its note once every relay has answered without it', async () => {
    reset()
    query.mockResolvedValue([])
    const reply = replyTo('2', '8')
    const view = await mount([reply])
    await act(async () => undefined)
    expect(view.last().waiting.size).toBe(0)
    expect(view.last().missing.has(reply.id)).toBe(true)
    await view.unmount()
  })

  it('asks once more when some relay had not finished, and holds the reply meanwhile', async () => {
    reset()
    finished.value = false
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([note('5', { pubkey: STRANGER })])
    const reply = replyTo('a', '5')
    vi.useFakeTimers()
    const view = await mount([reply])
    await act(async () => undefined)
    expect(view.last().waiting.has(reply.id)).toBe(true)
    await act(async () => vi.advanceTimersByTimeAsync(3_100))
    await act(async () => undefined)
    vi.useRealTimers()
    expect(query).toHaveBeenCalledTimes(2)
    expect(view.last().parents.get(reply.id)?.id).toBe(hex('5'))
    await view.unmount()
  })

  it('looks where the reply points as well as on the reader’s relays', async () => {
    reset()
    query.mockResolvedValue([note('d', { pubkey: STRANGER })])
    const reply = note('e', { tags: [['e', hex('d'), 'wss://hint.example', 'reply']] })
    const view = await mount([reply])
    await act(async () => undefined)
    expect(asked[0]).toEqual(expect.arrayContaining(['wss://mine.example', 'wss://hint.example']))
    expect(view.last().parents.get(reply.id)?.id).toBe(hex('d'))
    await view.unmount()
  })

  it('never throws a lookup away when more replies arrive while it is out', async () => {
    reset()
    const answers: ((events: NostrEvent[]) => void)[] = []
    query.mockImplementation(() => new Promise(resolve => answers.push(resolve)))
    const first = replyTo('3', '7')
    const view = await mount([first])
    expect(query).toHaveBeenCalledTimes(1)

    // A second reply lands before the first lookup answers: only its note is asked, the first lookup stays out.
    const second = replyTo('4', '6')
    await view.set([second, first])
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[1]?.[0]).toEqual([{ ids: [hex('6')] }])

    await act(async () => answers[0]?.([note('7', { pubkey: STRANGER })]))
    expect(view.last().parents.get(first.id)?.id).toBe(hex('7'))
    expect(view.last().waiting.has(second.id)).toBe(true)
    await act(async () => answers[1]?.([note('6', { pubkey: STRANGER })]))
    expect(view.last().waiting.size).toBe(0)
    await view.unmount()
  })

  it('asks nothing for a note that answers nobody', async () => {
    reset()
    const view = await mount([note('f')])
    expect(view.last().waiting.size).toBe(0)
    expect(query).not.toHaveBeenCalled()
    await view.unmount()
  })
})
