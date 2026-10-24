'use client'

import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_INDEXER_RELAYS,
  DEFAULT_RELAYS,
  EMOJI_LIST_KIND,
  EMOJI_PACK_KIND,
  EMPTY_EMOJI_SELECTION,
  MAX_PACKS_PER_READER,
  SEARCH_RELAYS,
  buildEmojiSelection,
  emojiIndex,
  hasEmojiPack,
  isPrivateUrl,
  newestReplaceable,
  normalizeRelayUrls,
  parseEmojiPack,
  parseEmojiSelection,
  resolveEmojiSet,
  togglePack,
  type CustomEmoji,
  type EmojiPack,
  type EmojiPackRef,
  type EmojiSelection,
  type Hex,
  type NostrEvent,
  type RelayUrl,
} from '@nostrich/nostr'

import { getPool } from './pool'
import { sessionPubkey, useSession } from '../components/SessionProvider'

/** The reader's custom emoji: their kind 10030 and every kind 30030 pack it names. */

const EMOJI_RELAYS: RelayUrl[] = normalizeRelayUrls([...DEFAULT_INDEXER_RELAYS, ...DEFAULT_RELAYS])

const PACK_RELAYS: RelayUrl[] = normalizeRelayUrls([...DEFAULT_RELAYS, 'wss://nostr.oxtr.dev'])

const QUERY_TIMEOUT_MS = 6_000

/** Authors per pack filter. */
const PACK_FILTER_AUTHORS = 20

/** Extra relays one pack fetch may open from the list's own hints. */
const MAX_PACK_HINT_RELAYS = 6

/** How many packs the Browse shelf asks each relay for, and how long it waits. */
const BROWSE_LIMIT = 500
const BROWSE_TIMEOUT_MS = 12_000

/** How often the arriving shelf repaints. */
const PAINT_EVERY_MS = 250
const BROWSE_MIN_EMOJI = 4

/** How many a search asks each relay for. */
const SEARCH_LIMIT = 100

/** Why a save did not happen. */
export class EmojiListError extends Error {
  constructor(public readonly reason: 'unreachable' | 'rejected') {
    super(reason)
    this.name = 'EmojiListError'
  }
}

export interface EmojiSetSnapshot {
  selection: EmojiSelection
  /** Pack by coordinate. */
  packs: Map<string, EmojiPack>
  /** Every pack the reader published, on their list or not. */
  own: Map<string, EmojiPack>
  /** `packs` plus the reader's own packs the list does not name: what the pickers draw from. */
  shown: Map<string, EmojiPack>
  /** Everything the reader can type, deduped and in their own order. */
  emoji: CustomEmoji[]
  index: Map<string, CustomEmoji>
  /** The kind 10030 this replaces, so unknown tags on it survive the next save. */
  event: NostrEvent | undefined
  /** Did any relay answer? */
  reachable: boolean
}

export const EMPTY_EMOJI_SET: EmojiSetSnapshot = {
  selection: EMPTY_EMOJI_SELECTION,
  packs: new Map(),
  own: new Map(),
  shown: new Map(),
  emoji: [],
  index: new Map(),
  event: undefined,
  reachable: false,
}

function queryKey(pubkey: string): string[] {
  return ['emoji-set', pubkey]
}

function snapshotOf(
  selection: EmojiSelection,
  packs: Map<string, EmojiPack>,
  event: NostrEvent | undefined,
  reachable: boolean,
  own: Map<string, EmojiPack> = new Map(),
): EmojiSetSnapshot {
  const { selection: drawn, shown } = withOwnPacks(selection, packs, own)
  const emoji = resolveEmojiSet(drawn, shown)
  return { selection, packs, own, shown, emoji, index: emojiIndex(emoji), event, reachable }
}

/** The list's packs first, then the reader's own packs it does not name. Shown, never written. */
export function withOwnPacks(
  selection: EmojiSelection,
  packs: ReadonlyMap<string, EmojiPack>,
  own: ReadonlyMap<string, EmojiPack>,
): { selection: EmojiSelection; shown: Map<string, EmojiPack> } {
  const shown = new Map(packs)
  const extra: EmojiPackRef[] = []
  for (const pack of own.values()) {
    if (hasEmojiPack(selection, pack.address) || shown.has(pack.address) || pack.emoji.length === 0) continue
    if (selection.packs.length + extra.length >= MAX_PACKS_PER_READER) break
    shown.set(pack.address, pack)
    extra.push({ address: pack.address })
  }
  if (extra.length === 0) return { selection, shown }
  return { selection: { ...selection, packs: [...selection.packs, ...extra] }, shown }
}

async function fetchOwnPacks(pubkey: Hex): Promise<Map<string, EmojiPack>> {
  try {
    const events = await getPool().query(
      [{ kinds: [EMOJI_PACK_KIND], authors: [pubkey], limit: MAX_PACKS_PER_READER }],
      PACK_RELAYS,
      QUERY_TIMEOUT_MS,
    )
    const newest = [...keepNewestPacks(events).values()].sort((a, b) => b.event.created_at - a.event.created_at)
    return new Map(newest.filter(pack => pack.pubkey === pubkey).map(pack => [pack.address, pack]))
  } catch {
    return new Map()
  }
}

/** Fetch the packs a selection names. */
export async function fetchEmojiPacks(refs: readonly EmojiPackRef[]): Promise<Map<string, EmojiPack>> {
  const wanted = new Set(refs.map(ref => ref.address))
  const byAuthor = new Map<string, string[]>()
  for (const address of wanted) {
    const parts = address.split(':')
    const pubkey = parts[1]
    const identifier = parts.slice(2).join(':')
    if (pubkey === undefined || identifier === '') continue
    const held = byAuthor.get(pubkey)
    if (held === undefined) byAuthor.set(pubkey, [identifier])
    else held.push(identifier)
  }
  if (byAuthor.size === 0) return new Map()

  const authors = [...byAuthor.keys()]
  const filters = []
  for (let index = 0; index < authors.length; index += PACK_FILTER_AUTHORS) {
    const slice = authors.slice(index, index + PACK_FILTER_AUTHORS)
    filters.push({
      kinds: [EMOJI_PACK_KIND],
      authors: slice,
      '#d': slice.flatMap(author => byAuthor.get(author) ?? []),
    })
  }

  const hints = normalizeRelayUrls(refs.flatMap(ref => (ref.relay === undefined ? [] : [ref.relay]))).filter(
    relay => !PACK_RELAYS.includes(relay) && !isPrivateUrl(relay),
  )
  const events = await getPool().query(
    filters,
    [...PACK_RELAYS, ...hints.slice(0, MAX_PACK_HINT_RELAYS)],
    QUERY_TIMEOUT_MS,
  )
  return keepNewestPacks(events, wanted)
}

export function keepNewestPacks(events: readonly NostrEvent[], wanted?: ReadonlySet<string>): Map<string, EmojiPack> {
  const newest = new Map<string, NostrEvent>()
  for (const event of events) {
    const pack = parseEmojiPack(event)
    if (pack === undefined) continue
    if (wanted !== undefined && !wanted.has(pack.address)) continue
    const held = newest.get(pack.address)
    newest.set(pack.address, held === undefined ? event : (newestReplaceable([held, event]) ?? event))
  }
  const packs = new Map<string, EmojiPack>()
  for (const [address, event] of newest) {
    const pack = parseEmojiPack(event)
    if (pack !== undefined) packs.set(address, pack)
  }
  return packs
}

async function loadEmojiSet(pubkey: Hex): Promise<EmojiSetSnapshot> {
  const ownPacks = fetchOwnPacks(pubkey)
  const outcome = await getPool().queryWithStatus(
    [{ kinds: [EMOJI_LIST_KIND], authors: [pubkey], limit: 1 }],
    EMOJI_RELAYS,
    QUERY_TIMEOUT_MS,
  )
  const reachable = outcome.answered > 0
  const event = newestReplaceable(outcome.events.filter(item => item.kind === EMOJI_LIST_KIND))
  const selection = parseEmojiSelection(event)
  const packs = selection.packs.length === 0 ? new Map<string, EmojiPack>() : await fetchEmojiPacks(selection.packs)
  return snapshotOf(selection, packs, event, reachable, await ownPacks)
}

export function packToggled(cached: EmojiSetSnapshot, pack: EmojiPack, add: boolean, relay?: string): EmojiSetSnapshot {
  const selection = togglePack(cached.selection, pack.address, relay)
  const packs = new Map(cached.packs)
  if (add) packs.set(pack.address, pack)
  else packs.delete(pack.address)
  return snapshotOf(selection, packs, cached.event, cached.reachable, cached.own)
}

export interface EmojiSetResult extends EmojiSetSnapshot {
  loading: boolean
  saving: boolean
  /** Whether this pack is on the reader's list. */
  has: (address: string) => boolean
  /** Add or remove a pack. */
  toggle: (pack: EmojiPack, relay?: string) => void
  canEdit: boolean
  error: Error | null
}

/** The reader's emoji, everywhere. Reading asks no signer anything. */
export function useEmojiSet(): EmojiSetResult {
  const { session } = useSession()
  const pubkey = sessionPubkey(session)
  const signer = session.status === 'signed' ? session.signer : undefined
  const key = pubkey ?? ''
  const client = useQueryClient()

  const query = useQuery({
    queryKey: queryKey(key),
    queryFn: async (): Promise<EmojiSetSnapshot> => (pubkey === undefined ? EMPTY_EMOJI_SET : loadEmojiSet(pubkey)),
    enabled: pubkey !== undefined,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  const snapshot = query.data ?? EMPTY_EMOJI_SET

  const mutation = useMutation({
    mutationKey: queryKey(key),
    scope: { id: `emoji-set:${key}` },
    mutationFn: async ({ pack, add, relay }: { pack: EmojiPack; add: boolean; relay?: string }): Promise<void> => {
      if (pubkey === undefined || signer === undefined) return
      const cached = client.getQueryData<EmojiSetSnapshot>(queryKey(key)) ?? EMPTY_EMOJI_SET
      if (hasEmojiPack(cached.selection, pack.address) === add) return

      // A list no relay answered for would be replaced by one holding only this change.
      if (!cached.reachable) throw new EmojiListError('unreachable')

      const shown = packToggled(cached, pack, add, relay)
      client.setQueryData<EmojiSetSnapshot>(queryKey(key), shown)

      try {
        const signed = await signer.signEvent(buildEmojiSelection({ selection: shown.selection, previous: cached.event }))
        const results = [...(await getPool().publish(signed)), ...(await getPool().publish(signed, EMOJI_RELAYS))]
        if (!results.some(result => result.ok)) throw new EmojiListError('rejected')
        client.setQueryData<EmojiSetSnapshot>(
          queryKey(key),
          snapshotOf(parseEmojiSelection(signed), shown.packs, signed, true, cached.own),
        )
      } catch (error) {
        client.setQueryData<EmojiSetSnapshot>(queryKey(key), cached)
        throw error
      }
    },
  })

  const has = useCallback((address: string): boolean => hasEmojiPack(snapshot.selection, address), [snapshot.selection])

  const toggle = useCallback(
    (pack: EmojiPack, relay?: string): void => {
      if (pubkey === undefined || signer === undefined) return
      const adding = !hasEmojiPack(snapshot.selection, pack.address)
      if (adding && snapshot.selection.packs.length >= MAX_PACKS_PER_READER) return
      mutation.mutate({ pack, add: adding, ...(relay === undefined ? {} : { relay }) })
    },
    [pubkey, signer, snapshot.selection, mutation],
  )

  return {
    ...snapshot,
    loading: query.isLoading,
    saving: mutation.isPending,
    has,
    toggle,
    canEdit: pubkey !== undefined && signer !== undefined,
    error: mutation.error,
  }
}

/** Just the lookup, for the publish paths. */
export function useEmojiIndex(): Map<string, CustomEmoji> {
  return useEmojiSet().index
}

/** Every pack a pubkey has published. */
export function useEmojiPacksBy(pubkey: Hex | undefined): { packs: EmojiPack[]; loading: boolean } {
  const query = useQuery({
    queryKey: ['emoji-packs-by', pubkey ?? ''],
    queryFn: async (): Promise<EmojiPack[]> => {
      if (pubkey === undefined) return []
      const events = await getPool().query(
        [{ kinds: [EMOJI_PACK_KIND], authors: [pubkey], limit: MAX_PACKS_PER_READER }],
        PACK_RELAYS,
        QUERY_TIMEOUT_MS,
      )
      return [...keepNewestPacks(events).values()].sort((a, b) => b.event.created_at - a.event.created_at)
    },
    enabled: pubkey !== undefined,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })
  return { packs: useMemo(() => query.data ?? [], [query.data]), loading: query.isLoading }
}

/** One pack by coordinate, for a pasted link. */
export async function fetchRequestedPack(address: string, relay?: string): Promise<EmojiPack | undefined> {
  const ref: EmojiPackRef = relay === undefined || relay === '' ? { address } : { address, relay }
  return (await fetchEmojiPacks([ref])).get(address)
}

/** What a pack looks like on the shelf: its set of pictures, order-free. */
export function packFingerprint(pack: EmojiPack): string {
  return pack.emoji
    .map(item => item.url)
    .sort()
    .join('\n')
}

/** Share of the smaller pack's pictures that must sit inside the larger for two to be one. */
const NEAR_TWIN = 0.8

/** The shelf with every repeat removed, and nothing that looks like a pack the reader already has. */
export function distinctPacks(packs: readonly EmojiPack[], owned: Iterable<EmojiPack> = []): EmojiPack[] {
  const mine = [...owned]
  const seen = new Set<string>(mine.map(packFingerprint))
  const exact: EmojiPack[] = []
  for (const pack of packs) {
    const print = packFingerprint(pack)
    if (print !== '' && seen.has(print)) continue
    if (print !== '') seen.add(print)
    exact.push(pack)
  }

  const title = (pack: EmojiPack): string => pack.title.trim().toLowerCase()
  const urls = new Map<EmojiPack, Set<string>>()
  const setOf = (pack: EmojiPack): Set<string> => {
    let held = urls.get(pack)
    if (held === undefined) {
      held = new Set(pack.emoji.map(item => item.url))
      urls.set(pack, held)
    }
    return held
  }
  const twins = (a: EmojiPack, b: EmojiPack): boolean => {
    if (title(a) !== title(b)) return false
    const small = setOf(a).size <= setOf(b).size ? setOf(a) : setOf(b)
    const large = small === setOf(a) ? setOf(b) : setOf(a)
    if (small.size === 0) return false
    let shared = 0
    for (const url of small) if (large.has(url)) shared += 1
    return shared / small.size >= NEAR_TWIN
  }

  const dropped = new Set<EmojiPack>()
  for (let i = 0; i < exact.length; i += 1) {
    const a = exact[i] as EmojiPack
    if (dropped.has(a)) continue
    if (mine.some(have => twins(a, have))) {
      dropped.add(a)
      continue
    }
    for (let j = i + 1; j < exact.length; j += 1) {
      const b = exact[j] as EmojiPack
      if (dropped.has(b) || !twins(a, b)) continue
      if (setOf(b).size > setOf(a).size) {
        dropped.add(a)
        break
      }
      dropped.add(b)
    }
  }
  return exact.filter(pack => !dropped.has(pack))
}

/** Lowercase with accents taken off, so a search matches however it is typed. */
export function foldText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()
}

/** Does this pack answer what somebody typed? Its name, its words and its shortcodes all count. */
export function matchesPackQuery(pack: EmojiPack, query: string): boolean {
  const terms = foldText(query).split(/\s+/).filter(term => term !== '')
  if (terms.length === 0) return true
  const haystack = foldText(
    [pack.title, pack.identifier, pack.description ?? '', ...pack.emoji.map(item => item.shortcode)].join(' '),
  )
  return terms.every(term => haystack.includes(term))
}

/** Matches, best first: a pack named for the words before one that merely contains them. */
export function rankPackMatches(packs: readonly EmojiPack[], query: string): EmojiPack[] {
  const terms = foldText(query).split(/\s+/).filter(term => term !== '')
  if (terms.length === 0) return [...packs]
  const tier = (pack: EmojiPack): number => {
    const name = foldText(`${pack.title} ${pack.identifier}`)
    if (terms.every(term => name.includes(term))) return 0
    return matchesPackQuery(pack, query) ? 1 : 2
  }
  return [...packs].sort((a, b) => tier(a) - tier(b))
}

/** Packs matching what the reader typed, off the relays that can search. */
export function useEmojiPackSearch(query: string): { packs: EmojiPack[]; loading: boolean } {
  const term = query.trim()
  const search = useQuery({
    queryKey: ['emoji-packs-search', term.toLowerCase()],
    queryFn: async (): Promise<EmojiPack[]> => {
      const events = await getPool().query(
        [{ kinds: [EMOJI_PACK_KIND], search: term, limit: SEARCH_LIMIT }],
        [...SEARCH_RELAYS],
        QUERY_TIMEOUT_MS,
      )
      return [...keepNewestPacks(events).values()].sort((a, b) => b.event.created_at - a.event.created_at)
    },
    enabled: term.length >= 2,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })
  return { packs: useMemo(() => search.data ?? [], [search.data]), loading: search.isLoading && term.length >= 2 }
}

/** The Browse shelf, drawn as it arrives. */
export function useBrowsableEmojiPacks(): { packs: EmojiPack[]; loading: boolean } {
  const [arriving, setArriving] = useState<EmojiPack[]>([])

  const query = useQuery({
    queryKey: ['emoji-packs-browse'],
    queryFn: async (): Promise<EmojiPack[]> => {
      const seen: NostrEvent[] = []
      let painted = 0
      const events = await getPool().query([{ kinds: [EMOJI_PACK_KIND], limit: BROWSE_LIMIT }], PACK_RELAYS, BROWSE_TIMEOUT_MS, {
        graceMs: 0,
        onEvent: event => {
          seen.push(event)
          if (Date.now() - painted < PAINT_EVERY_MS) return
          painted = Date.now()
          setArriving(shelfOrder(keepNewestPacks(seen)))
        },
      })
      return shelfOrder(keepNewestPacks(events))
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  const packs = query.data ?? arriving
  return { packs, loading: query.isLoading && packs.length === 0 }
}

/** Enough emoji to be worth a card, a name of its own, newest first. */
function shelfOrder(packs: Map<string, EmojiPack>): EmojiPack[] {
  return [...packs.values()]
    .filter(pack => pack.emoji.length >= BROWSE_MIN_EMOJI && !pack.untitled)
    .sort((a, b) => b.event.created_at - a.event.created_at)
}
