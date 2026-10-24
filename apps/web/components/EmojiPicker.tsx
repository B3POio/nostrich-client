'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CustomEmoji } from '@nostrich/nostr'

import { useMenuClickAway } from '../lib/dismiss'
import { useEmojiSet } from '../lib/emoji-packs'
import { EmojiThumb } from './EmojiThumb'

/** A small emoji picker, hand-rolled rather than pulled from a package. */

const GROUPS: { name: string; emoji: string[] }[] = [
  {
    name: 'Smileys',
    emoji: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐',
      '😐','😑','😶','😏','😒','🙄','😬','😮','😴','😪','😵','🤯','🥳','😎','🤓','🧐',
    ],
  },
  {
    name: 'Gestures',
    emoji: [
      '👍','👎','👌','🤌','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋',
      '🤚','🖐️','🖖','👋','🤝','🙏','✍️','💪','🦾','🫶','👏','🙌','👐','🤲','🫡','🤷',
    ],
  },
  {
    name: 'Hearts',
    emoji: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💯','🔥'],
  },
  {
    name: 'Nostr',
    emoji: ['⚡','🟣','🦩','🔑','🛡️','🌐','📡','🗝️','🧡','🚀','🫂','☕','🤙','₿','🍊','💜'],
  },
  {
    name: 'Objects',
    emoji: [
      '✅','❌','⭐','🌟','✨','🎉','🎊','🎁','📌','📍','🔗','📎','📝','📖','💡','🔔',
      '⏰','📅','🖼️','🎥','🎵','🎶','☀️','🌙','🌈','☁️','❄️','🌊','🌱','🍀','🐦','🦅',
    ],
  },
]

/** The reader's custom emoji, a section per pack. */
function packSections(
  emoji: readonly CustomEmoji[],
  titleOf: (address: string) => string | undefined,
): { key: string; title: string; emoji: CustomEmoji[] }[] {
  const sections = new Map<string, { key: string; title: string; emoji: CustomEmoji[] }>()
  for (const item of emoji) {
    const key = item.pack ?? 'mine'
    const held = sections.get(key)
    if (held !== undefined) held.emoji.push(item)
    else sections.set(key, { key, title: (item.pack === undefined ? undefined : titleOf(item.pack)) ?? 'Your emoji', emoji: [item] })
  }
  return [...sections.values()]
}

export function EmojiPicker({
  onPick,
  onPickCustom,
  onClose,
  above = false,
  align = 'left',
}: {
  onPick: (emoji: string) => void
  /** A custom emoji from the reader's packs; without it the Yours tab is not drawn. */
  onPickCustom?: (emoji: CustomEmoji) => void
  onClose: () => void
  /** Opens upward instead of down. */
  above?: boolean
  /** Which edge it hangs. */
  align?: 'left' | 'right'
}): React.ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [group, setGroup] = useState(0)

  // Armed a tick late, so the click that opened this does not close it again.
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), 0)
    return () => clearTimeout(timer)
  }, [])
  useMenuClickAway(() => true, [ref], onClose, armed)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = useEmojiSet()
  const sections = useMemo(
    () => (onPickCustom === undefined ? [] : packSections(set.emoji, address => set.shown.get(address)?.title)),
    [onPickCustom, set.emoji, set.shown],
  )
  const tabs = sections.length > 0 ? ['Yours', ...GROUPS.map(item => item.name)] : GROUPS.map(item => item.name)
  const yours = sections.length > 0 && group === 0
  const active = GROUPS[sections.length > 0 ? group - 1 : group] ?? GROUPS[0]

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Emoji"
      // Opens DOWNWARD.
      /** A BOTTOM SHEET on a phone, an anchored popover from `sm` up. */
      className={`fixed inset-x-2 bottom-2 z-50 max-h-[70dvh] w-auto overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:max-h-none sm:rounded-lg ${
        above ? 'sm:bottom-full sm:mb-2' : 'sm:top-full sm:mt-2'
      } ${align === 'right' ? 'sm:right-0' : 'sm:left-0'} sm:w-[min(360px,calc(100vw-2rem))]`}
    >
      <div className="no-scrollbar flex overflow-x-auto border-b border-border">
        {tabs.map((name, index) => (
          <button
            key={name}
            type="button"
            onClick={() => setGroup(index)}
            // Never broken mid-word: with the Yours tab the strip scrolls instead.
            className={`flex-auto shrink-0 whitespace-nowrap px-2 py-2 text-xs font-semibold transition-colors ${
              index === group ? 'text-text' : 'text-text-faint hover:text-text-muted'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      {yours ? (
        <div className="max-h-56 overflow-y-auto p-2">
          {sections.map(section => (
            <section key={section.key} className="mb-2 last:mb-0">
              <h3 className="truncate px-1 pb-1 text-[11px] font-semibold text-text-faint">{section.title}</h3>
              <div className="grid grid-cols-8 gap-0.5">
                {section.emoji.map(item => (
                  <button
                    key={`${section.key}/${item.shortcode}`}
                    type="button"
                    onClick={() => onPickCustom?.(item)}
                    aria-label={`:${item.shortcode}:`}
                    className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-bg-inset"
                  >
                    <EmojiThumb emoji={item} size="size-6" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-2">
          {active?.emoji.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => onPick(emoji)}
              aria-label={emoji}
              className="flex size-8 items-center justify-center rounded-lg text-[20px] leading-none transition-colors hover:bg-bg-inset"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
