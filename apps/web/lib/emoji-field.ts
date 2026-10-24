'use client'

import { useCallback, useState } from 'react'
import type { CustomEmoji } from '@nostrich/nostr'

import { foldText } from './emoji-packs'

export interface ShortcodeQuery {
  /** What follows the colon. */
  term: string
  /** Where the colon is. */
  start: number
  /** The caret. */
  end: number
}

/** The `:word` under the caret, if there is one. A colon after a letter is not a shortcode. */
export function shortcodeAt(value: string, caret: number): ShortcodeQuery | undefined {
  const before = value.slice(0, caret)
  const match = /(^|[^\p{L}\p{N}\p{M}_]):([\p{L}\p{N}\p{M}_-]+)$/u.exec(before)
  if (match === null) return undefined
  const term = match[2] ?? ''
  if (term.length < 2) return undefined
  return { term, start: caret - term.length - 1, end: caret }
}

export const EMOJI_LISTBOX_ID = 'emoji-suggestions'

export interface EmojiField {
  /** The `:word` under the caret, or undefined. */
  query: ShortcodeQuery | undefined
  sync: (node: HTMLTextAreaElement | null) => void
  dismiss: () => void
  /** Replace the typed `:word` with the full `:shortcode:`. */
  apply: (node: HTMLTextAreaElement | null, value: string, emoji: CustomEmoji, setValue: (next: string) => void) => void
  /** Put a picked emoji in at the caret. */
  insert: (node: HTMLTextAreaElement | null, value: string, emoji: CustomEmoji, setValue: (next: string) => void) => void
}

function put(
  node: HTMLTextAreaElement | null,
  value: string,
  from: number,
  to: number,
  text: string,
  setValue: (next: string) => void,
): void {
  // Never welded to the word before it.
  const previous = from === 0 ? '' : value.charAt(from - 1)
  const lead = /[A-Za-z0-9_]/.test(previous) ? ' ' : ''
  setValue(value.slice(0, from) + lead + text + value.slice(to))
  requestAnimationFrame(() => {
    if (node === null) return
    node.focus()
    node.selectionStart = node.selectionEnd = from + lead.length + text.length
  })
}

export function useEmojiField(): EmojiField {
  const [query, setQuery] = useState<ShortcodeQuery | undefined>(undefined)

  const sync = useCallback((node: HTMLTextAreaElement | null): void => {
    if (node === null) return
    setQuery(shortcodeAt(node.value, node.selectionStart ?? node.value.length))
  }, [])

  const dismiss = useCallback((): void => setQuery(undefined), [])

  const apply = useCallback(
    (node: HTMLTextAreaElement | null, value: string, emoji: CustomEmoji, setValue: (next: string) => void): void => {
      const at = shortcodeAt(value, node?.selectionStart ?? value.length)
      if (at === undefined) return
      put(node, value, at.start, at.end, `:${emoji.shortcode}: `, setValue)
      setQuery(undefined)
    },
    [],
  )

  const insert = useCallback(
    (node: HTMLTextAreaElement | null, value: string, emoji: CustomEmoji, setValue: (next: string) => void): void => {
      const at = Math.min(node?.selectionStart ?? value.length, value.length)
      const to = Math.max(at, Math.min(node?.selectionEnd ?? at, value.length))
      put(node, value, at, to, `:${emoji.shortcode}: `, setValue)
      setQuery(undefined)
    },
    [],
  )

  return { query, sync, dismiss, apply, insert }
}

/** The emoji a typed term offers, best first: codes that start with it, then codes that contain it. */
export function suggestEmoji(emoji: readonly CustomEmoji[], term: string, max = 8): CustomEmoji[] {
  const needle = foldText(term)
  if (needle.trim() === '') return []
  const starts: CustomEmoji[] = []
  const contains: CustomEmoji[] = []
  for (const item of emoji) {
    const code = foldText(item.shortcode)
    if (code.startsWith(needle)) starts.push(item)
    else if (code.includes(needle)) contains.push(item)
  }
  const byLength = (a: CustomEmoji, b: CustomEmoji): number => a.shortcode.length - b.shortcode.length
  return [...starts.sort(byLength), ...contains.sort(byLength)].slice(0, max)
}
