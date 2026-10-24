import { newestLiveVersions } from './deletions'
import { getIdentifier, getTagValue, normalizeHex, nowSeconds } from './events'
import type { EventTemplate, Hex, NostrEvent } from './types'

export const FOLLOW_SET_KIND = 30000
/** Follow packs (starter packs). */
export const FOLLOW_PACK_KIND = 39089
export const PEOPLE_LIST_KINDS: readonly number[] = [FOLLOW_SET_KIND, FOLLOW_PACK_KIND]

/** Identifiers other apps keep their own machinery under. */
export const SYSTEM_LIST_IDS: ReadonlySet<string> = new Set(['mute', 'mutelists', 'allowlist', 'pin', 'bookmark', 'communities'])

/** The ceiling for ADDING a member. */
export const MAX_LIST_MEMBERS = 1_000

export interface PeopleList {
  kind: number
  address: string
  pubkey: Hex
  identifier: string
  /** `title`, else `name`, else a `d` that reads as a word. */
  title: string | undefined
  description: string | undefined
  image: string | undefined
  /** The `p` tags, validated, lowercased, deduplicated, in the list's own order. */
  publicMembers: Hex[]
  /** Whether `content` holds a private half at all. */
  hasPrivate: boolean
  event: NostrEvent
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether an identifier is a random id rather than a name somebody chose. */
export function isRandomIdentifier(identifier: string): boolean {
  if (UUID.test(identifier)) return true
  return /^[A-Za-z0-9_-]{16,}$/.test(identifier) && /\d/.test(identifier) && /[A-Z]/.test(identifier) && /[a-z]/.test(identifier)
}

/** `p` tag values, validated as hex keys, lowercased, deduplicated, order kept. */
export function membersOf(tags: readonly (readonly string[])[]): Hex[] {
  const seen = new Set<Hex>()
  const members: Hex[] = []
  for (const tag of tags) {
    if (tag[0] !== 'p') continue
    const pubkey = normalizeHex(tag[1])
    if (pubkey === undefined || seen.has(pubkey)) continue
    seen.add(pubkey)
    members.push(pubkey)
  }
  return members
}

function firstText(event: NostrEvent, name: string): string | undefined {
  const value = getTagValue(event, name)?.trim()
  return value === undefined || value === '' ? undefined : value
}

export function parsePeopleList(event: NostrEvent): PeopleList | undefined {
  if (!PEOPLE_LIST_KINDS.includes(event.kind)) return undefined
  const pubkey = normalizeHex(event.pubkey)
  if (pubkey === undefined) return undefined
  const identifier = getIdentifier(event)
  const title =
    firstText(event, 'title') ??
    firstText(event, 'name') ??
    (identifier.trim() !== '' && !isRandomIdentifier(identifier) ? identifier.trim() : undefined)
  return {
    kind: event.kind,
    address: `${event.kind}:${pubkey}:${identifier}`,
    pubkey,
    identifier,
    title,
    description: firstText(event, 'description') ?? firstText(event, 'summary'),
    image: firstText(event, 'image') ?? firstText(event, 'thumb'),
    publicMembers: membersOf(event.tags),
    hasPrivate: event.kind === FOLLOW_SET_KIND && event.content.trim() !== '',
    event,
  }
}

export function isSystemList(list: Pick<PeopleList, 'kind' | 'identifier'>): boolean {
  return list.kind === FOLLOW_SET_KIND && SYSTEM_LIST_IDS.has(list.identifier)
}

export function isDeletionStub(list: Pick<PeopleList, 'event'>): boolean {
  return list.event.content.trim() === '' && list.event.tags.every(tag => tag[0] === 'd')
}

/** A list worth drawing: not somebody's machinery and not a deletion's leftovers. */
export function isShownList(list: PeopleList): boolean {
  return !isSystemList(list) && !isDeletionStub(list)
}

/** The newest version of each list in `events`, minus every one its author deleted. */
export function newestPeopleLists(events: readonly NostrEvent[]): PeopleList[] {
  const relevant = events.filter(event => event.kind === 5 || PEOPLE_LIST_KINDS.includes(event.kind))
  const lists: PeopleList[] = []
  for (const event of newestLiveVersions(relevant)) {
    const list = parsePeopleList(event)
    if (list !== undefined) lists.push(list)
  }
  return lists
}

/** How a list keeps its members, given what is known of its private half. */
export type ListPrivacy = 'public' | 'private' | 'mixed'

/** Public, private or both. */
export function listPrivacy(list: Pick<PeopleList, 'publicMembers' | 'hasPrivate'>, privateTags?: readonly (readonly string[])[]): ListPrivacy {
  const publicSide = list.publicMembers.length > 0
  const privateSide = privateTags === undefined ? list.hasPrivate : membersOf(privateTags).length > 0 || (list.hasPrivate && !publicSide)
  if (publicSide && privateSide) return 'mixed'
  if (privateSide) return 'private'
  return 'public'
}

/** `tags` with `pubkey` as a `p` tag, appended when absent. */
export function withMember(tags: readonly (readonly string[])[], pubkey: Hex): string[][] {
  const target = normalizeHex(pubkey)
  const copy = tags.map(tag => [...tag])
  if (target === undefined) return copy
  if (copy.some(tag => tag[0] === 'p' && normalizeHex(tag[1]) === target)) return copy
  copy.push(['p', target])
  return copy
}

/** `tags` without any `p` tag naming `pubkey`. */
export function withoutMember(tags: readonly (readonly string[])[], pubkey: Hex): string[][] {
  const target = normalizeHex(pubkey)
  return tags.filter(tag => !(tag[0] === 'p' && normalizeHex(tag[1]) === target)).map(tag => [...tag])
}

/** `tags` renamed. */
export function withTitle(tags: readonly (readonly string[])[], title: string): string[][] {
  const value = title.trim()
  const out: string[][] = []
  let titled = false
  for (const tag of tags) {
    if (tag[0] === 'title') {
      if (!titled) out.push(['title', value, ...tag.slice(2)])
      titled = true
    } else if (tag[0] === 'name') {
      out.push(['name', value, ...tag.slice(2)])
    } else {
      out.push([...tag])
    }
  }
  if (!titled) out.push(['title', value])
  return out
}

/** Every member onto one side, for the list's Private switch. */
export function moveMembers(
  publicTags: readonly (readonly string[])[],
  privateTags: readonly (readonly string[])[],
  toPrivate: boolean,
): { publicTags: string[][]; privateTags: string[][] } {
  const [from, to] = toPrivate ? [publicTags, privateTags] : [privateTags, publicTags]
  const moving = from.filter(tag => tag[0] === 'p')
  const staying = from.filter(tag => tag[0] !== 'p').map(tag => [...tag])
  let destination = to.map(tag => [...tag])
  for (const tag of moving) {
    const pubkey = normalizeHex(tag[1])
    if (pubkey === undefined) continue
    if (destination.some(held => held[0] === 'p' && normalizeHex(held[1]) === pubkey)) continue
    destination = [...destination, [...tag]]
  }
  return toPrivate ? { publicTags: staying, privateTags: destination } : { publicTags: destination, privateTags: staying }
}

export interface BuildPeopleListInput {
  kind?: number
  identifier: string
  tags: readonly (readonly string[])[]
  privateHalf: 'carry' | { ciphertext: string }
  previous?: NostrEvent
  createdAt?: number
}

/** The next version of a list. */
export function buildPeopleList(input: BuildPeopleListInput): EventTemplate {
  const kind = input.kind ?? input.previous?.kind ?? FOLLOW_SET_KIND
  const tags: string[][] = [['d', input.identifier]]
  for (const tag of input.tags) {
    if (tag[0] === 'd' || tag[0] === 'client') continue
    tags.push([...tag])
  }
  const content =
    input.privateHalf === 'carry' ? (kind === FOLLOW_SET_KIND ? (input.previous?.content ?? '') : '') : input.privateHalf.ciphertext
  const now = input.createdAt ?? nowSeconds()
  const created_at = input.previous === undefined ? now : Math.max(now, input.previous.created_at + 1)
  return { kind, created_at, tags, content }
}

/** The version a deletion leaves: its `d` and nothing else, so relays that ignore NIP-09 stop serving the members. */
export function emptiedPeopleList(previous: NostrEvent, createdAt?: number): EventTemplate {
  return buildPeopleList({ kind: previous.kind, identifier: getIdentifier(previous), tags: [], privateHalf: { ciphertext: '' }, previous, createdAt })
}
