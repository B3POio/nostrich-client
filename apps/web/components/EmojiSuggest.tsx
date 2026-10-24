'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CustomEmoji } from '@nostrich/nostr'

import { EMOJI_LISTBOX_ID, suggestEmoji, type ShortcodeQuery } from '../lib/emoji-field'
import { useEmojiSet } from '../lib/emoji-packs'
import { EmojiThumb } from './EmojiThumb'

/** The panel that opens under a `:shortcode` being typed. */
export function EmojiSuggest({
  query,
  onPick,
  onDismiss,
  placement = 'down',
  field,
}: {
  query: ShortcodeQuery
  onPick: (emoji: CustomEmoji) => void
  onDismiss: () => void
  /** `up` for a field pinned to the bottom of the screen. */
  placement?: 'down' | 'up'
  /** The field this list belongs to, so its keys reach no other composer. */
  field?: HTMLElement | null
}): React.ReactNode {
  const { emoji } = useEmojiSet()
  const [active, setActive] = useState(0)

  const candidates = useMemo(() => suggestEmoji(emoji, query.term), [emoji, query.term])

  useEffect(() => {
    setActive(0)
  }, [query.term])

  const commit = useCallback(
    (item: CustomEmoji | undefined): boolean => {
      if (item === undefined) return false
      onPick(item)
      return true
    },
    [onPick],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (candidates.length === 0) return
      const focused = document.activeElement
      if (field != null ? focused !== field : focused?.tagName !== 'TEXTAREA') return
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onDismiss()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setActive(current => (current + step + candidates.length) % candidates.length)
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        if (!commit(candidates[active])) return
        event.preventDefault()
        event.stopPropagation()
      }
    }
    // Capture, so Enter picks here before the composer reads it as a new line or a post.
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [candidates, active, commit, field, onDismiss])

  if (candidates.length === 0) return null

  return (
    <div
      id={EMOJI_LISTBOX_ID}
      role="listbox"
      aria-label="Custom emoji"
      className={`absolute left-0 right-0 z-50 max-h-72 overflow-y-auto rounded-lg border border-border bg-bg-elevated py-1 shadow-lg ${
        placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
      }`}
    >
      {candidates.map((item, index) => (
        <button
          key={`${item.pack ?? 'mine'}/${item.shortcode}`}
          type="button"
          role="option"
          aria-selected={index === active}
          onMouseDown={event => {
            event.preventDefault()
            commit(item)
          }}
          onMouseEnter={() => setActive(index)}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
            index === active ? 'bg-bg-inset text-text' : 'text-text-muted'
          }`}
        >
          <span className="shrink-0">
            <EmojiThumb emoji={item} size="size-5" />
          </span>
          <span className="truncate">:{item.shortcode}:</span>
        </button>
      ))}
    </div>
  )
}
