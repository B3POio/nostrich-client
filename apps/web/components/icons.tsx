'use client'

/** The app's own drawings for the menu and the glyphs Material Symbols gets wrong for this app. */

/** A round head over an arc of shoulders. */
export const PROFILE_PATH = 'M8 7.7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0ZM4 21.3c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5'

/** A filled round chat bubble with a tail, on a 256 grid. */
export const CHAT_BUBBLE_PATH =
  'M128,20A108,108,0,0,0,31.85,177.23L21,209.66A20,20,0,0,0,46.34,235l32.43-10.81A108,108,0,1,0,128,20Zm0,192a84,84,0,0,1-42.06-11.27,12,12,0,0,0-6-1.62,12.1,12.1,0,0,0-3.8.62l-29.79,9.93,9.93-29.79a12,12,0,0,0-1-9.81A84,84,0,1,1,128,212Z'

/** The bubble's inside alone, filled to draw it solid. */
export const CHAT_BUBBLE_INSIDE_PATH =
  'M128,212a84,84,0,0,1-42.06-11.27,12,12,0,0,0-6-1.62,12.1,12.1,0,0,0-3.8.62l-29.79,9.93,9.93-29.79a12,12,0,0,0-1-9.81A84,84,0,1,1,128,212Z'

/** The grid the filled drawings are on. */
export const FILLED_VIEWBOX = '0 0 256 256'

/** A filled drawing's inside, for its solid state. */
const INSIDE: Record<string, string> = {
  [CHAT_BUBBLE_PATH]: CHAT_BUBBLE_INSIDE_PATH,
}

/** The line that closes a filled drawing's inside without a hairline gap. */
const SEAM = 2

/** A house with a door. */
export const HOME_PATH =
  'M3 11 10.9 3.4a1.6 1.6 0 0 1 2.2 0L21 11v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-5.5a1.5 1.5 0 0 0-1.5-1.5h-3A1.5 1.5 0 0 0 9 15.5V21H4.5A1.5 1.5 0 0 1 3 19.5Z'

/** A bell with an open clapper. */
export const NOTIFICATIONS_PATH = 'M6 9a6 6 0 1 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9M10.3 20.5a1.9 1.9 0 0 0 3.4 0'

/** A magnifier. */
export const EXPLORE_PATH = 'M4 11a7 7 0 1 0 14 0a7 7 0 1 0 -14 0ZM20 20l-3.5-3.5'

/** The dot in the magnifier's lens when its row is lit. */
export const EXPLORE_ACTIVE_PATH = 'M7.4 11a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0Z'

/** A page of lines. */
export const ARTICLES_PATH =
  'M6.5 3h11a2.5 2.5 0 0 1 2.5 2.5v13a2.5 2.5 0 0 1 -2.5 2.5h-11a2.5 2.5 0 0 1 -2.5 -2.5v-13a2.5 2.5 0 0 1 2.5 -2.5ZM8 8h8M8 12h8M8 16h5'

/** Three dotted lines. */
export const LISTS_PATH =
  'M9 6h11M9 12h11M9 18h11M4 6a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0ZM4.5 6h.01M4 12a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0ZM4.5 12h.01M4 18a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0ZM4.5 18h.01'

/** A smiling face. */
export const EMOJI_PACKS_PATH =
  'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0ZM8.5 14a4.5 4.5 0 0 0 7 0M8.5 9.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0ZM9 9.5h.01M14.5 9.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0ZM15 9.5h.01'

/** A cloud with an arrow down. */
export const DOWNLOADS_PATH =
  'M8.6 15.4H6a3.7 3.7 0 0 1-.5-7.37 5.9 5.9 0 0 1 9.3-3.2 4.2 4.2 0 0 1 4.3 3.3 3.7 3.7 0 0 1-.8 7.27h-2.6M12 12v9.6M8.5 18.1 12 21.6l3.5-3.5'

/** A round gear with a hub. */
export const SETTINGS_PATH =
  'M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'

/** What a lit row draws instead of filling its drawing. */
const LIT_MARK: Record<string, string> = {
  [EXPLORE_PATH]: EXPLORE_ACTIVE_PATH,
}

/** Every menu drawing's larger side, between the middles of its outermost lines. */
export const STANDARD_EXTENT = 18

/** How wide a drawing is in its own file, for the ones not drawn to the standard. */
export const MENU_FIT: Record<string, { extent: number; middle?: number }> = {
  [EXPLORE_PATH]: { extent: 16 },
  [NOTIFICATIONS_PATH]: { extent: 17, middle: 12.275 },
  [LISTS_PATH]: { extent: 16 },
  [SETTINGS_PATH]: { extent: 22 },
}

/** One menu glyph, stroked on the 24 grid or filled on the 256 one, drawn to the menu's one size. */
export function NavGlyph({
  path,
  filled = false,
  solid = false,
  className,
  weight = 2.25,
  size = 24,
}: {
  path: string
  filled?: boolean
  solid?: boolean
  className?: string
  weight?: number
  size?: number
}): React.ReactNode {
  if (filled) {
    const inside = solid ? INSIDE[path] : undefined
    return (
      <svg viewBox={FILLED_VIEWBOX} width={size} height={size} aria-hidden="true" className={className} fill="currentColor">
        <path d={path} />
        {inside === undefined ? null : <path d={inside} stroke="currentColor" strokeWidth={SEAM} />}
      </svg>
    )
  }
  const mark = solid ? LIT_MARK[path] : undefined
  const fit = MENU_FIT[path]
  const scale = fit === undefined ? 1 : Math.round((STANDARD_EXTENT / fit.extent) * 1e4) / 1e4
  const drawing = (
    <>
      <path d={path} />
      {mark === undefined ? null : <path d={mark} fill="currentColor" stroke="none" />}
    </>
  )
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      fill={solid && mark === undefined ? 'currentColor' : 'none'}
      stroke="currentColor"
      overflow="visible"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {fit === undefined ? (
        drawing
      ) : (
        // The line is divided by the scale, so it is still `weight` on screen.
        <g
          transform={`translate(12 12) scale(${scale}) translate(-12 ${-(fit.middle ?? 12)})`}
          strokeWidth={Math.round((weight / scale) * 1e4) / 1e4}
        >
          {drawing}
        </g>
      )}
    </svg>
  )
}

/** `size` is the box, `weight` the stroke in 24-grid units. */
export function ChatBubbleIcon({
  size = 20,
  weight = 2.25,
}: {
  size?: number
  weight?: number
}): React.ReactNode {
  return (
    <svg viewBox={FILLED_VIEWBOX} aria-hidden="true" width={size} height={size} className="shrink-0" fill="currentColor">
      <path d={CHAT_BUBBLE_PATH} />
    </svg>
  )
}

/** The same bubble, with a + inside it: "start a conversation". */
export function NewChatIcon({
  size = 20,
  weight = 2.25,
}: {
  size?: number
  weight?: number
}): React.ReactNode {
  return (
    <svg viewBox={FILLED_VIEWBOX} aria-hidden="true" width={size} height={size} className="shrink-0" fill="currentColor">
      <path d={CHAT_BUBBLE_PATH} />
      {/* The cross, scaled to the 256 grid and stroked over the bubble. */}
      <path d="M128 94v56M100 122h56" fill="none" stroke="currentColor" strokeWidth={weight * 11} strokeLinecap="round" />
    </svg>
  )
}

/** The two looping arrows, the same path the action row's repost button draws. */
export { PATHS as ACTION_PATHS } from '@nostrich/app/src/components/icon-paths'

/** The plus inside the action pill. */
export function PlusGlyph(): React.ReactNode {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[15px]">
      <path fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" d="M8 3.2v9.6M12.8 8H3.2" />
    </svg>
  )
}

/** A small padlock, for what only the reader can see. */
export function LockGlyph({ className = 'size-[13px]' }: { className?: string } = {}): React.ReactNode {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 7.2h7a1 1 0 0 1 1 1v4.6a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V8.2a1 1 0 0 1 1-1ZM5.6 7.2V5.4a2.4 2.4 0 0 1 4.8 0v1.8"
      />
    </svg>
  )
}
