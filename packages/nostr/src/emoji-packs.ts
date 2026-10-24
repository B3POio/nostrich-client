/** NIP-30 custom emoji: the PACKS (kind 30030) and the reader's SELECTION (kind 10030). */

import { parseContent } from './content'
import { getTagValue, getTags, nowSeconds, parseAddress } from './events'
import { isPrivateUrl } from './relays'
import type { EventTemplate, Hex, NostrEvent } from './types'

export const EMOJI_PACK_KIND = 30030
export const EMOJI_LIST_KIND = 10030

export const MAX_EMOJI_PER_PACK = 2_048

/** Packs one reader may carry. */
export const MAX_PACKS_PER_READER = 128

/** The most packs this module will PARSE off somebody's list. */
const MAX_PACKS_PARSED = 1_000

/** Emoji one reader may carry across every pack. */
export const MAX_EMOJI_PER_READER = 5_000

/** Longest shortcode kept. */
export const MAX_SHORTCODE_LENGTH = 100

/** Longest pack name or description kept. */
export const MAX_PACK_TITLE_LENGTH = 80
export const MAX_PACK_DESCRIPTION_LENGTH = 280

/** What a shortcode may contain. */
const SHORTCODE = /^[A-Za-z0-9_-]+$/

/** One emoji: what to type, what to draw, and which pack it came from. */
export interface CustomEmoji {
  shortcode: string
  url: string
  /** `30030:<pubkey>:<d>` when the emoji came from a pack rather than the reader's own list. */
  pack?: string
  /** Set by `resolveEmojiSet` when a second pack claimed this code first. */
  renamedFrom?: string
}

/** A pack on the reader's list, and where to find it. */
export interface EmojiPackRef {
  address: string
  relay?: string
}

export interface EmojiPack {
  address: string
  pubkey: Hex
  identifier: string
  /** `title`, else the deprecated `name`, else the `d` identifier. */
  title: string
  /** True when the pack named itself neither way, so a surface can say so. */
  untitled: boolean
  description?: string
  image?: string
  emoji: CustomEmoji[]
  /** How many of the pack's emoji this app cannot use (unusable shortcode, non-http url). */
  dropped: number
  event: NostrEvent
}

/** A reader's kind-10030, parsed. */
export interface EmojiSelection {
  /** Packs, in list order. */
  packs: EmojiPackRef[]
  /** Emoji declared on the list itself, belonging to no pack. */
  loose: CustomEmoji[]
}

export const EMPTY_EMOJI_SELECTION: EmojiSelection = { packs: [], loose: [] }

export function isEmojiShortcode(value: string): boolean {
  return value.length > 0 && value.length <= MAX_SHORTCODE_LENGTH && SHORTCODE.test(value)
}

function isEmojiUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && value.length <= 2_048 && !isPrivateUrl(value)
}

export function packAddress(pubkey: string, identifier: string): string {
  return `${EMOJI_PACK_KIND}:${pubkey.toLowerCase()}:${identifier}`
}

/** A coordinate, only if it names an emoji pack. */
export function parsePackAddress(value: string): { pubkey: Hex; identifier: string } | undefined {
  const parsed = parseAddress(value)
  if (parsed === undefined || parsed.kind !== EMOJI_PACK_KIND) return undefined
  if (parsed.identifier === '') return undefined
  return { pubkey: parsed.pubkey, identifier: parsed.identifier }
}

export function parseEmojiTag(tag: readonly string[], pack?: string): CustomEmoji | undefined {
  if (tag[0] !== 'emoji') return undefined
  const shortcode = tag[1]
  const url = tag[2]
  if (shortcode === undefined || url === undefined) return undefined
  if (!isEmojiShortcode(shortcode) || !isEmojiUrl(url)) return undefined
  const declared = tag[3] !== undefined && parsePackAddress(tag[3]) !== undefined ? tag[3] : undefined
  const from = declared ?? pack
  return from === undefined ? { shortcode, url } : { shortcode, url, pack: from }
}

/** Three fields. */
export function emojiTag(emoji: CustomEmoji): string[] {
  return ['emoji', emoji.shortcode, emoji.url]
}

function trimmed(event: NostrEvent, names: readonly string[], max: number): string | undefined {
  for (const name of names) {
    const value = getTagValue(event, name)?.trim()
    if (value !== undefined && value !== '') return value.slice(0, max)
  }
  return undefined
}

/** A kind-30030 to a pack, or `undefined` when there is nothing to show. */
export function parseEmojiPack(event: NostrEvent): EmojiPack | undefined {
  if (event.kind !== EMOJI_PACK_KIND) return undefined
  const identifier = getTagValue(event, 'd')
  if (identifier === undefined || identifier === '') return undefined
  const address = packAddress(event.pubkey, identifier)

  const emoji: CustomEmoji[] = []
  const seen = new Set<string>()
  let dropped = 0
  for (const tag of getTags(event, 'emoji')) {
    const parsed = parseEmojiTag(tag, address)
    if (parsed === undefined) {
      dropped += 1
      continue
    }
    const key = parsed.shortcode.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    emoji.push(parsed)
    if (emoji.length >= MAX_EMOJI_PER_PACK) break
  }
  if (emoji.length === 0) return undefined

  const title = trimmed(event, ['title', 'name'], MAX_PACK_TITLE_LENGTH)
  const description = trimmed(event, ['description', 'about'], MAX_PACK_DESCRIPTION_LENGTH)
  const image = trimmed(event, ['image', 'picture'], 2_048)

  const pack: EmojiPack = {
    address,
    pubkey: event.pubkey.toLowerCase() as Hex,
    identifier,
    title: title ?? identifier.slice(0, MAX_PACK_TITLE_LENGTH),
    untitled: title === undefined,
    emoji,
    dropped,
    event,
  }
  if (description !== undefined) pack.description = description
  if (image !== undefined && isEmojiUrl(image)) pack.image = image
  return pack
}

/** A kind-10030 to a selection. */
export function parseEmojiSelection(event: NostrEvent | undefined): EmojiSelection {
  if (event === undefined || event.kind !== EMOJI_LIST_KIND) return EMPTY_EMOJI_SELECTION
  return { packs: selectionPacks(event.tags), loose: selectionLoose(event.tags) }
}

/** The pack half of a tag array. */
export function selectionPacks(tags: readonly (readonly string[])[]): EmojiPackRef[] {
  const packs: EmojiPackRef[] = []
  const seen = new Set<string>()
  for (const tag of tags) {
    if (tag[0] !== 'a' || tag[1] === undefined) continue
    const parsed = parsePackAddress(tag[1])
    if (parsed === undefined) continue
    const address = packAddress(parsed.pubkey, parsed.identifier)
    if (seen.has(address)) continue
    seen.add(address)
    const relay = tag[2]
    packs.push(relay === undefined || relay === '' ? { address } : { address, relay })
    if (packs.length >= MAX_PACKS_PARSED) break
  }
  return packs
}

/** The loose-emoji half of a tag array. */
export function selectionLoose(tags: readonly (readonly string[])[]): CustomEmoji[] {
  const loose: CustomEmoji[] = []
  const seen = new Set<string>()
  for (const tag of tags) {
    const parsed = parseEmojiTag(tag)
    if (parsed === undefined) continue
    const key = parsed.shortcode.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    loose.push(parsed)
    if (loose.length >= MAX_EMOJI_PER_READER) break
  }
  return loose
}

export function hasEmojiPack(selection: EmojiSelection, address: string): boolean {
  return selection.packs.some(ref => ref.address === address)
}

/** Add or remove one pack, newest first, returning a new selection. */
export function togglePack(selection: EmojiSelection, address: string, relay?: string): EmojiSelection {
  if (hasEmojiPack(selection, address)) {
    return { packs: selection.packs.filter(ref => ref.address !== address), loose: selection.loose }
  }
  const added: EmojiPackRef = relay === undefined || relay === '' ? { address } : { address, relay }
  const room = Math.max(MAX_PACKS_PER_READER, selection.packs.length + 1)
  return { packs: [added, ...selection.packs].slice(0, room), loose: selection.loose }
}

/** The event to publish. */
export function buildEmojiSelection({
  selection,
  previous,
  createdAt = nowSeconds(),
}: {
  selection: EmojiSelection
  previous?: NostrEvent
  createdAt?: number
}): EventTemplate {
  const rewritten = new Set(selection.loose.map(emoji => emoji.shortcode))
  const carried = (previous?.tags ?? []).filter(tag => {
    const name = tag[0]
    if (name === 'emoji') return tag[1] === undefined || !rewritten.has(tag[1])
    if (name === 'a') return tag[1] === undefined || parsePackAddress(tag[1]) === undefined
    return true
  })

  return {
    kind: EMOJI_LIST_KIND,
    created_at: Math.max(createdAt, (previous?.created_at ?? 0) + 1),
    tags: [
      ...selection.packs
        .slice(0, MAX_PACKS_PARSED)
        .map(ref => (ref.relay === undefined ? ['a', ref.address] : ['a', ref.address, ref.relay])),
      ...selection.loose.slice(0, MAX_EMOJI_PER_READER).map(emojiTag),
      ...carried.map(tag => [...tag]),
    ],
    content: previous?.content ?? '',
  }
}

export interface EmojiPackInput {
  /** The `d` tag. */
  identifier: string
  title: string
  emoji: readonly CustomEmoji[]
  description?: string
  image?: string
  /** The pack being edited, so tags this app does not know about survive the save. */
  previous?: NostrEvent
  createdAt?: number
}

/** The pack event to publish. */
export function buildEmojiPack(input: EmojiPackInput): EventTemplate {
  const own = new Set(['d', 'title', 'name', 'description', 'image', 'picture', 'emoji'])
  const carried = (input.previous?.tags ?? []).filter(tag => tag[0] === undefined || !own.has(tag[0]))
  const title = input.title.slice(0, MAX_PACK_TITLE_LENGTH)
  const tags: string[][] = [
    ['d', input.identifier],
    ['title', title],
    ['name', title],
  ]
  if (input.description !== undefined && input.description !== '') {
    tags.push(['description', input.description.slice(0, MAX_PACK_DESCRIPTION_LENGTH)])
  }
  if (input.image !== undefined && isEmojiUrl(input.image)) {
    tags.push(['image', input.image], ['picture', input.image])
  }
  for (const emoji of input.emoji.slice(0, MAX_EMOJI_PER_PACK)) {
    if (!isEmojiShortcode(emoji.shortcode) || !isEmojiUrl(emoji.url)) continue
    tags.push(emojiTag(emoji))
  }
  return {
    kind: EMOJI_PACK_KIND,
    created_at: Math.max(input.createdAt ?? nowSeconds(), (input.previous?.created_at ?? 0) + 1),
    tags: [...tags, ...carried.map(tag => [...tag])],
    content: input.previous?.content ?? '',
  }
}

/** A suffix that tells two packs' `:pepe:` apart: `pepe_4f2a1b`. */
function collisionSuffix(pack: string | undefined, index: number): string {
  const identifier = pack === undefined ? '' : pack.split(':').slice(2).join(':')
  const squeezed = identifier.replace(/[^A-Za-z0-9_]/g, '').slice(-6)
  return squeezed === '' ? String(index) : squeezed
}

/** Everything the reader can type, in the order the picker draws it. */
export function resolveEmojiSet(
  selection: EmojiSelection,
  packs: ReadonlyMap<string, EmojiPack>,
): CustomEmoji[] {
  const out: CustomEmoji[] = []
  const byCode = new Map<string, string>()
  const take = (emoji: CustomEmoji, index: number): void => {
    if (out.length >= MAX_EMOJI_PER_READER) return
    const key = emoji.shortcode.toLowerCase()
    const held = byCode.get(key)
    if (held === emoji.url) return
    if (held === undefined) {
      byCode.set(key, emoji.url)
      out.push(emoji)
      return
    }
    const renamed = `${emoji.shortcode}_${collisionSuffix(emoji.pack, index)}`
    const renamedKey = renamed.toLowerCase()
    if (!isEmojiShortcode(renamed) || byCode.has(renamedKey)) return
    byCode.set(renamedKey, emoji.url)
    out.push({ ...emoji, shortcode: renamed, renamedFrom: emoji.shortcode })
  }
  for (const emoji of selection.loose) take(emoji, 0)
  selection.packs.forEach((ref, index) => {
    const pack = packs.get(ref.address)
    if (pack === undefined) return
    for (const emoji of pack.emoji) take(emoji, index + 1)
  })
  return out
}

/** Lookup by shortcode, case-insensitive, over a resolved set. */
export function emojiIndex(emoji: readonly CustomEmoji[]): Map<string, CustomEmoji> {
  const index = new Map<string, CustomEmoji>()
  for (const item of emoji) {
    const key = item.shortcode.toLowerCase()
    if (!index.has(key)) index.set(key, item)
  }
  return index
}

/** A URL no request is ever made to. */
const PROBE_URL = 'https://shortcode.invalid/'

/** Every `:shortcode:` in a draft, as the RENDERER would see it. */
export function shortcodesIn(content: string): string[] {
  const candidates = new Set<string>()
  for (const match of content.matchAll(/:([A-Za-z0-9_-]+):/g)) {
    const code = match[1]
    if (code === undefined || !isEmojiShortcode(code)) continue
    const before = match.index === undefined || match.index === 0 ? '' : content.charAt(match.index - 1)
    if (/[A-Za-z0-9_]/.test(before)) continue
    candidates.add(code)
  }
  if (candidates.size === 0) return []
  const declared = [...candidates].map(code => ['emoji', code, PROBE_URL])
  const out: string[] = []
  for (const segment of parseContent(content, declared)) {
    if (segment.type !== 'emoji') continue
    if (!out.includes(segment.shortcode)) out.push(segment.shortcode)
  }
  return out
}

/** The `emoji` tags a draft needs, in the order they appear in the text. */
export function emojiTagsFor(content: string, available: ReadonlyMap<string, CustomEmoji>): string[][] {
  if (available.size === 0) return []
  const tags: string[][] = []
  for (const shortcode of shortcodesIn(content)) {
    const emoji = available.get(shortcode.toLowerCase())
    if (emoji === undefined) continue
    tags.push(['emoji', shortcode, emoji.url])
  }
  return tags
}

/** NIP-01 replaceable tie-break: newest wins, and the lower id wins a tie on the second. */
export function newestReplaceable(events: readonly NostrEvent[]): NostrEvent | undefined {
  let best: NostrEvent | undefined
  for (const event of events) {
    if (best === undefined || event.created_at > best.created_at) {
      best = event
      continue
    }
    if (event.created_at === best.created_at && event.id < best.id) best = event
  }
  return best
}
