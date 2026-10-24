'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_INDEXER_RELAYS,
  DEFAULT_RELAYS,
  FOLLOW_PACK_KIND,
  FOLLOW_SET_KIND,
  MAX_LIST_MEMBERS,
  buildDeletion,
  buildPeopleList,
  emptiedPeopleList,
  isSealed,
  isShownList,
  listPrivacy,
  membersOf,
  moveMembers,
  newestPeopleLists,
  nip07SupportsNip44,
  normalizeHex,
  normalizeRelayUrls,
  parsePeopleList,
  parsePrivateTags,
  privateTagsPlaintext,
  withMember,
  withTitle,
  withoutMember,
  type Hex,
  type ListPrivacy,
  type NostrEvent,
  type PeopleList,
  type RelayUrl,
  type Signer,
} from '@nostrich/nostr'

import { getPool } from './pool'
import { askInBackground, asksQuietly, decryptOwn } from './signer-prompts'
import { sessionPubkey, sessionSigner, useSession } from '../components/SessionProvider'

/** Where lists are looked for and written beside the reader's own relays. */
const LIST_RELAYS: RelayUrl[] = normalizeRelayUrls([...DEFAULT_INDEXER_RELAYS, ...DEFAULT_RELAYS])
const QUERY_TIMEOUT_MS = 8_000
const FRESH_TIMEOUT_MS = 4_000

/** The reader's relays and the list relays. */
function listRelays(): RelayUrl[] {
  return [...new Set<RelayUrl>([...getPool().readRelays(), ...LIST_RELAYS])]
}

export interface ListEntry {
  list: PeopleList
  /** The opened private half. */
  privateTags: string[][] | undefined
}

export interface PeopleListsSnapshot {
  entries: ListEntry[]
  /** Did any relay answer the read. */
  reachable: boolean
}

const EMPTY: PeopleListsSnapshot = { entries: [], reachable: false }

function queryKey(pubkey: string): string[] {
  return ['people-lists', pubkey]
}

/** The list's private half exists and is not open here. */
export function privateUnread(entry: ListEntry): boolean {
  return entry.list.hasPrivate && entry.privateTags === undefined
}

/** Everyone on the list this device knows of: public, then the opened private half. */
export function entryMembers(entry: ListEntry): Hex[] {
  const seen = new Set<Hex>()
  const out: Hex[] = []
  for (const pubkey of [...entry.list.publicMembers, ...membersOf(entry.privateTags ?? [])]) {
    if (seen.has(pubkey)) continue
    seen.add(pubkey)
    out.push(pubkey)
  }
  return out
}

/** Public, private or mixed, as far as this device knows. */
export function entryPrivacy(entry: ListEntry): ListPrivacy {
  return listPrivacy(entry.list, entry.privateTags)
}

/** The members kept in the encrypted half, when it is open. */
export function privateMembersOf(entry: ListEntry): Set<Hex> {
  return new Set(membersOf(entry.privateTags ?? []))
}

function sortEntries(entries: ListEntry[]): ListEntry[] {
  return [...entries].sort((a, b) => {
    const left = a.list.title
    const right = b.list.title
    if (left === undefined && right !== undefined) return 1
    if (left !== undefined && right === undefined) return -1
    const byTitle = (left ?? '').localeCompare(right ?? '', undefined, { sensitivity: 'base' })
    return byTitle !== 0 ? byTitle : b.list.event.created_at - a.list.event.created_at
  })
}

async function openAtLoad(list: PeopleList, pubkey: Hex, signer: Signer | undefined, held: PeopleListsSnapshot | undefined): Promise<ListEntry> {
  if (!list.hasPrivate) return { list, privateTags: [] }
  const before = held?.entries.find(entry => entry.list.event.id === list.event.id)
  if (before?.privateTags !== undefined) return { list, privateTags: before.privateTags }
  if (signer === undefined || !asksQuietly(signer)) return { list, privateTags: undefined }
  try {
    return { list, privateTags: parsePrivateTags(await decryptOwn(signer, pubkey, list.event.content)) }
  } catch {
    return { list, privateTags: undefined }
  }
}

async function loadPeopleLists(pubkey: Hex, signer: Signer | undefined, held: PeopleListsSnapshot | undefined): Promise<PeopleListsSnapshot> {
  const kinds = [FOLLOW_SET_KIND, FOLLOW_PACK_KIND]
  const outcome = await getPool().queryWithStatus(
    [
      { kinds, authors: [pubkey], limit: 500 },
      { kinds: [5], authors: [pubkey], '#k': kinds.map(String), limit: 500 },
    ],
    listRelays(),
    QUERY_TIMEOUT_MS,
  )
  const known = held?.entries.map(entry => entry.list.event) ?? []
  const lists = newestPeopleLists([...outcome.events, ...known]).filter(isShownList)
  const entries = await Promise.all(lists.map(list => openAtLoad(list, pubkey, signer, held)))
  return { entries: sortEntries(entries), reachable: outcome.answered > 0 }
}

const opening = new Map<string, Promise<string[][] | undefined>>()

async function openHalf(signer: Signer, pubkey: Hex, list: PeopleList, background: boolean): Promise<string[][]> {
  let pending = opening.get(list.event.id)
  if (pending === undefined) {
    const ask = (): Promise<string> => decryptOwn(signer, pubkey, list.event.content)
    pending = (background ? askInBackground(signer, ask) : ask()).then(parsePrivateTags, () => undefined)
    opening.set(list.event.id, pending)
    const settled = pending
    void settled.then(tags => {
      if (tags === undefined && opening.get(list.event.id) === settled) opening.delete(list.event.id)
    })
  }
  const tags = await pending
  if (tags === undefined) throw new PeopleListError('private-unread')
  return tags
}

export type PeopleListErrorCode = 'unreachable' | 'rejected' | 'encrypt' | 'private-unread' | 'repair' | 'missing' | 'full' | 'cancelled'

export class PeopleListError extends Error {
  constructor(readonly code: PeopleListErrorCode) {
    super(code)
    this.name = 'PeopleListError'
  }
}

function pairedWithoutLists(signer: Signer): boolean {
  if (signer.kind !== 'nip46') return false
  const perms = (signer as { toResumable?: () => { perms?: string[] } | undefined }).toResumable?.()?.perms
  return perms !== undefined && perms.length > 0 && !perms.includes(`sign_event:${FOLLOW_SET_KIND}`)
}

/** Whether this signer can encrypt, judged from its surface, never by asking it. */
function canEncryptWithoutAsking(signer: Signer | undefined): boolean {
  if (signer === undefined) return false
  if (signer.kind === 'nip07') return nip07SupportsNip44()
  return true
}

/** The newest copy of one list, fetched before it is written. */
async function freshest(pubkey: Hex, entry: ListEntry): Promise<ListEntry> {
  const outcome = await getPool().queryWithStatus(
    [{ kinds: [entry.list.kind], authors: [pubkey], '#d': [entry.list.identifier], limit: 5 }],
    listRelays(),
    FRESH_TIMEOUT_MS,
  )
  const newest = newestPeopleLists([entry.list.event, ...outcome.events])[0]
  if (newest === undefined || newest.event.id === entry.list.event.id) return entry
  return { list: newest, privateTags: newest.hasPrivate ? undefined : [] }
}

export type ListAction =
  | { type: 'create'; title: string; members: Hex[]; private: boolean }
  | { type: 'edit'; address: string; title: string; members: Hex[]; privacy: ListPrivacy }
  | { type: 'toggle'; address: string; pubkey: Hex; add: boolean }
  | { type: 'delete'; address: string }

export interface Written {
  entry: ListEntry | undefined
  removed?: string
}

function sameTags(a: readonly (readonly string[])[], b: readonly (readonly string[])[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export interface ListWriteControl {
  onSigner?: (asking: boolean) => void
  signal?: AbortSignal
}

async function asking<T>(control: ListWriteControl, call: () => Promise<T>): Promise<T> {
  control.onSigner?.(true)
  try {
    return await call()
  } finally {
    control.onSigner?.(false)
  }
}

async function sealHalf(signer: Signer, pubkey: Hex, tags: string[][], keepMarker: boolean, control: ListWriteControl): Promise<{ ciphertext: string }> {
  if (tags.length === 0 && !keepMarker) return { ciphertext: '' }
  const plaintext = privateTagsPlaintext(tags)
  const ciphertext = await asking(control, () => signer.nip44Encrypt(pubkey, plaintext))
  if (!isSealed(ciphertext, plaintext)) throw new PeopleListError('encrypt')
  return { ciphertext }
}

async function signAndPublish(signer: Signer, pubkey: Hex, template: Parameters<Signer['signEvent']>[0], control: ListWriteControl): Promise<NostrEvent> {
  let signed: NostrEvent
  try {
    signed = await asking(control, () => signer.signEvent(template))
  } catch (error) {
    if (pairedWithoutLists(signer)) throw new PeopleListError('repair')
    throw error
  }
  if (control.signal?.aborted === true) throw new PeopleListError('cancelled')
  // The reader's write relays, and the list relays beside them.
  const results = [...(await getPool().publish(signed)), ...(await getPool().publish(signed, LIST_RELAYS))]
  if (!results.some(result => result.ok)) throw new PeopleListError('rejected')
  return signed
}

/** The write, or `cancelled` the moment Cancel is pressed, whichever is first. */
function untilTakenBack<T>(write: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return write
  write.catch(() => undefined)
  return new Promise<T>((resolve, reject) => {
    const takeBack = (): void => reject(new PeopleListError('cancelled'))
    if (signal.aborted) return takeBack()
    signal.addEventListener('abort', takeBack, { once: true })
    write.then(resolve, reject).finally(() => signal.removeEventListener('abort', takeBack))
  })
}

/** One action against the cached lists. */
export async function applyListAction(
  signer: Signer,
  pubkey: Hex,
  cached: PeopleListsSnapshot,
  action: ListAction,
  control: ListWriteControl = {},
): Promise<Written> {
  if (action.type === 'create') {
    const members = action.members.slice(0, MAX_LIST_MEMBERS)
    const memberTags = members.map(pubkey => ['p', pubkey])
    const publicTags = [['title', action.title.trim()], ...(action.private ? [] : memberTags)]
    const privateHalf = action.private ? await sealHalf(signer, pubkey, memberTags, true, control) : { ciphertext: '' }
    const template = buildPeopleList({ kind: FOLLOW_SET_KIND, identifier: crypto.randomUUID(), tags: publicTags, privateHalf })
    const signed = await signAndPublish(signer, pubkey, template, control)
    const list = parsePeopleList(signed)
    return { entry: list === undefined ? undefined : { list, privateTags: action.private ? memberTags : [] } }
  }

  const held = cached.entries.find(entry => entry.list.address === action.address)
  if (held === undefined) throw new PeopleListError('missing')

  if (action.type === 'delete') {
    const stub = await signAndPublish(signer, pubkey, emptiedPeopleList(held.list.event), control)
    await signAndPublish(signer, pubkey, buildDeletion([held.list.event, stub], pubkey), control)
    return { entry: undefined, removed: action.address }
  }

  if (!cached.reachable) throw new PeopleListError('unreachable')
  const entry = await freshest(pubkey, held)
  const publicTags = entry.list.event.tags.filter(tag => tag[0] !== 'd')
  const isPack = entry.list.kind === FOLLOW_PACK_KIND

  if (action.type === 'toggle') {
    const privacy = isPack ? 'public' : entryPrivacy(entry)
    if (action.add) {
      if (entryMembers(entry).includes(action.pubkey)) return { entry }
      if (entryMembers(entry).length >= MAX_LIST_MEMBERS) throw new PeopleListError('full')
      if (privacy === 'public') {
        const template = buildPeopleList({ identifier: entry.list.identifier, tags: withMember(publicTags, action.pubkey), privateHalf: 'carry', previous: entry.list.event })
        const signed = await signAndPublish(signer, pubkey, template, control)
        return { entry: { list: parsePeopleList(signed)!, privateTags: entry.privateTags } }
      }
      const opened = entry.privateTags ?? (await asking(control, () => openHalf(signer, pubkey, entry.list, false)))
      const nextPrivate = withMember(opened, action.pubkey)
      const template = buildPeopleList({
        identifier: entry.list.identifier,
        tags: publicTags,
        privateHalf: await sealHalf(signer, pubkey, nextPrivate, true, control),
        previous: entry.list.event,
      })
      const signed = await signAndPublish(signer, pubkey, template, control)
      return { entry: { list: parsePeopleList(signed)!, privateTags: nextPrivate } }
    }
    let opened = entry.privateTags
    if (opened === undefined && entry.list.hasPrivate) {
      try {
        opened = await asking(control, () => openHalf(signer, pubkey, entry.list, false))
      } catch {
        opened = undefined
      }
    }
    const nextPublic = withoutMember(publicTags, action.pubkey)
    const nextPrivate = opened === undefined ? undefined : withoutMember(opened, action.pubkey)
    const privateChanged = opened !== undefined && nextPrivate !== undefined && !sameTags(opened, nextPrivate)
    if (sameTags(nextPublic, publicTags) && !privateChanged) return { entry: { ...entry, privateTags: opened } }
    const template = buildPeopleList({
      identifier: entry.list.identifier,
      tags: nextPublic,
      privateHalf: privateChanged ? await sealHalf(signer, pubkey, nextPrivate!, privacy === 'private', control) : 'carry',
      previous: entry.list.event,
    })
    const signed = await signAndPublish(signer, pubkey, template, control)
    return { entry: { list: parsePeopleList(signed)!, privateTags: nextPrivate ?? opened } }
  }

  const want = new Set(action.members.map(member => normalizeHex(member)).filter((pubkey): pubkey is Hex => pubkey !== undefined))
  const keepIf = (tag: readonly string[]): boolean => tag[0] !== 'p' || want.has(normalizeHex(tag[1]) ?? '')
  let nextPublic = publicTags.filter(keepIf)
  if (entry.privateTags === undefined && entry.list.hasPrivate) {
    for (const pubkey of want) nextPublic = withMember(nextPublic, pubkey)
    const template = buildPeopleList({ identifier: entry.list.identifier, tags: withTitle(nextPublic, action.title), privateHalf: 'carry', previous: entry.list.event })
    const signed = await signAndPublish(signer, pubkey, template, control)
    return { entry: { list: parsePeopleList(signed)!, privateTags: undefined } }
  }
  const openedPrivate = entry.privateTags ?? []
  let nextPrivate = openedPrivate.filter(keepIf)
  const present = new Set([...membersOf(nextPublic), ...membersOf(nextPrivate)])
  const privacy: ListPrivacy = isPack ? 'public' : action.privacy
  for (const pubkey of want) {
    if (present.has(pubkey)) continue
    if (privacy === 'public') nextPublic = withMember(nextPublic, pubkey)
    else nextPrivate = withMember(nextPrivate, pubkey)
  }
  if (privacy === 'private') ({ publicTags: nextPublic, privateTags: nextPrivate } = moveMembers(nextPublic, nextPrivate, true))
  if (privacy === 'public') ({ publicTags: nextPublic, privateTags: nextPrivate } = moveMembers(nextPublic, nextPrivate, false))
  nextPublic = withTitle(nextPublic, action.title)
  const marker = privacy === 'private'
  const privateChanged = !sameTags(openedPrivate, nextPrivate) || (marker && !entry.list.hasPrivate) || (!marker && nextPrivate.length === 0 && entry.list.hasPrivate)
  const template = buildPeopleList({
    identifier: entry.list.identifier,
    tags: nextPublic,
    privateHalf: privateChanged ? await sealHalf(signer, pubkey, nextPrivate, marker, control) : 'carry',
    previous: entry.list.event,
  })
  const signed = await signAndPublish(signer, pubkey, template, control)
  return { entry: { list: parsePeopleList(signed)!, privateTags: nextPrivate } }
}

export interface PeopleListsView {
  /** The read has settled (or there is nobody to read for). */
  ready: boolean
  reachable: boolean
  /** A signer is present: lists can be created and edited. */
  canWrite: boolean
  canEncrypt: boolean
  entries: ListEntry[]
  find: (address: string) => ListEntry | undefined
  /** Open one list's private half because the reader pressed something. */
  show: (address: string) => Promise<boolean>
  run: (action: ListAction, control?: ListWriteControl) => Promise<ListEntry | undefined>
  saving: boolean
}

export interface PeopleListsOptions {
  reveal?: string
}

export function usePeopleLists({ reveal }: PeopleListsOptions = {}): PeopleListsView {
  const { session } = useSession()
  const pubkey = sessionPubkey(session)
  const signer = sessionSigner(session)
  const key = pubkey ?? ''
  const client = useQueryClient()

  const query = useQuery({
    queryKey: queryKey(key),
    queryFn: async (): Promise<PeopleListsSnapshot> => {
      if (pubkey === undefined) return EMPTY
      return loadPeopleLists(pubkey, signer, client.getQueryData<PeopleListsSnapshot>(queryKey(key)))
    },
    enabled: pubkey !== undefined,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })
  const snapshot = query.data ?? EMPTY

  const putEntry = useCallback(
    (entry: ListEntry): void => {
      client.setQueryData<PeopleListsSnapshot>(queryKey(key), cached => {
        const base = cached ?? EMPTY
        const others = base.entries.filter(held => held.list.address !== entry.list.address)
        return { ...base, entries: sortEntries([...others, entry]) }
      })
    },
    [client, key],
  )

  const openInto = useCallback(
    async (address: string, background: boolean): Promise<boolean> => {
      if (pubkey === undefined || signer === undefined) return false
      const entry = client.getQueryData<PeopleListsSnapshot>(queryKey(key))?.entries.find(held => held.list.address === address)
      if (entry === undefined || !privateUnread(entry)) return entry !== undefined
      try {
        const privateTags = await openHalf(signer, pubkey, entry.list, background)
        client.setQueryData<PeopleListsSnapshot>(queryKey(key), cached => {
          if (cached === undefined) return cached
          const entries = cached.entries.map(held => (held.list.event.id === entry.list.event.id ? { ...held, privateTags } : held))
          return { ...cached, entries }
        })
        return true
      } catch {
        return false
      }
    },
    [client, key, pubkey, signer],
  )

  const revealed = useRef<string | undefined>(undefined)
  const revealEntry = reveal === undefined ? undefined : snapshot.entries.find(entry => entry.list.address === reveal)
  const revealId = revealEntry !== undefined && privateUnread(revealEntry) ? revealEntry.list.event.id : undefined
  useEffect(() => {
    if (reveal === undefined || revealId === undefined) return
    if (revealed.current === revealId) return
    revealed.current = revealId
    void openInto(reveal, true)
  }, [reveal, revealId, openInto])

  const mutation = useMutation({
    mutationKey: queryKey(key),
    scope: { id: `people-lists:${key}` },
    mutationFn: async ({ action, control }: { action: ListAction; control?: ListWriteControl }): Promise<ListEntry | undefined> => {
      if (pubkey === undefined || signer === undefined) throw new PeopleListError('missing')
      const cached = client.getQueryData<PeopleListsSnapshot>(queryKey(key)) ?? EMPTY
      const written = await untilTakenBack(applyListAction(signer, pubkey, cached, action, control), control?.signal)
      if (written.removed !== undefined) {
        const removed = written.removed
        client.setQueryData<PeopleListsSnapshot>(queryKey(key), current =>
          current === undefined ? current : { ...current, entries: current.entries.filter(entry => entry.list.address !== removed) },
        )
      }
      if (written.entry !== undefined) putEntry(written.entry)
      return written.entry
    },
  })

  const find = useCallback((address: string) => snapshot.entries.find(entry => entry.list.address === address), [snapshot.entries])
  const show = useCallback((address: string) => openInto(address, false), [openInto])
  const mutateAsync = mutation.mutateAsync
  const run = useCallback((action: ListAction, control?: ListWriteControl) => mutateAsync({ action, control }), [mutateAsync])

  return useMemo(
    () => ({
      ready: pubkey === undefined || !query.isPending,
      reachable: snapshot.reachable,
      canWrite: signer !== undefined,
      canEncrypt: canEncryptWithoutAsking(signer),
      entries: snapshot.entries,
      find,
      show,
      run,
      saving: mutation.isPending,
    }),
    [pubkey, query.isPending, snapshot, signer, find, show, run, mutation.isPending],
  )
}

export function usePeopleListAt(address: string | undefined, hints: readonly string[] = []): { list: PeopleList | undefined; ready: boolean } {
  const [kind, author, ...rest] = address?.split(':') ?? []
  const identifier = rest.join(':')
  const pubkey = normalizeHex(author)
  const query = useQuery({
    queryKey: ['people-list', address ?? ''],
    queryFn: async (): Promise<PeopleList | null> => {
      if (pubkey === undefined || kind === undefined) return null
      const relays = [...new Set<RelayUrl>([...normalizeRelayUrls([...hints]), ...LIST_RELAYS])]
      const events = await getPool().query(
        [
          { kinds: [Number(kind)], authors: [pubkey], '#d': [identifier], limit: 5 },
          { kinds: [5], authors: [pubkey], '#a': [address!], limit: 5 },
        ],
        relays,
        QUERY_TIMEOUT_MS,
      )
      return newestPeopleLists(events).find(list => isShownList(list)) ?? null
    },
    enabled: address !== undefined && pubkey !== undefined,
    staleTime: 5 * 60_000,
  })
  return { list: query.data ?? undefined, ready: address === undefined || !query.isPending }
}

/** The sentence a list screen shows for a failed write. */
export function listErrorText(error: unknown): string {
  if (!(error instanceof PeopleListError)) return 'Something went wrong. Try again.'
  switch (error.code) {
    case 'unreachable':
      return "Your lists couldn't be loaded from your relays, so nothing was changed."
    case 'rejected':
      return 'No relay accepted the change.'
    case 'encrypt':
      return "Your signer couldn't encrypt the private half, so nothing was saved."
    case 'private-unread':
      return "The private half of this list couldn't be opened, so nothing was changed."
    case 'repair':
      return 'Your remote signer was paired without permission to edit lists. Pair it again to edit them.'
    case 'full':
      return 'This list is full.'
    case 'missing':
    case 'cancelled':
      return 'Something went wrong. Try again.'
  }
}
