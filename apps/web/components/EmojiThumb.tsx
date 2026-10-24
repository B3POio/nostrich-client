'use client'

import { useEffect, useRef, useState } from 'react'
import type { CustomEmoji } from '@nostrich/nostr'

/** One custom emoji, drawn the same way in the picker, the typeahead and the pack cards. */

/** URLs that have already failed in this document. */
const failed = new Set<string>()

/** How long an emoji has to arrive before the surface stops holding a hole for it. */
const SLOW_MS = 10_000

/** For tests, which must not inherit a set poisoned by another case. */
export function __resetEmojiFailuresForTest(): void {
  failed.clear()
}

export function EmojiThumb({
  emoji,
  size,
  onFailed,
  fallback = 'chip',
}: {
  emoji: CustomEmoji
  /** Tailwind size class for the box. */
  size: string
  /** Told once when this emoji turns out to be dead, so a shelf can drop a card nobody can use. */
  onFailed?: (emoji: CustomEmoji) => void
  /** What a dead emoji leaves behind. */
  fallback?: 'chip' | 'none'
}): React.ReactNode {
  const [dead, setDead] = useState(() => failed.has(emoji.url))
  const node = useRef<HTMLImageElement | null>(null)
  const label = `:${emoji.shortcode}:`

  useEffect(() => {
    if (dead) return undefined
    let timer: ReturnType<typeof setTimeout>
    let looks = 0
    const check = (): void => {
      const image = node.current
      if (image === null || image.complete) return
      if (image.currentSrc === '') {
        looks += 1
        if (looks > 30) return
        timer = setTimeout(check, 8_000)
        return
      }
      setDead(true)
    }
    timer = setTimeout(check, SLOW_MS)
    return () => clearTimeout(timer)
  }, [dead, emoji.url])

  const told = useRef(false)
  useEffect(() => {
    if (!dead || told.current) return
    told.current = true
    onFailed?.(emoji)
  }, [dead])

  if (dead || failed.has(emoji.url)) {
    if (fallback === 'none') return null
    return (
      <span
        title={label}
        aria-label={label}
        className={`${size} flex items-center justify-center overflow-hidden rounded bg-bg-inset px-0.5 text-[8px] font-medium leading-none text-text-faint`}
      >
        <span className="truncate">{emoji.shortcode}</span>
      </span>
    )
  }

  return (
    <img
      ref={image => {
        node.current = image
        if (image !== null && image.complete && image.naturalWidth === 0) {
          failed.add(emoji.url)
          setDead(true)
        }
      }}
      src={emoji.url}
      alt={label}
      title={label}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        failed.add(emoji.url)
        setDead(true)
      }}
      className={`${size} object-contain`}
    />
  )
}
