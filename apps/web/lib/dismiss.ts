'use client'

import { useEffect, useRef, type RefObject } from 'react'

/** Close a popover when the reader clicks away from it or presses Escape. */
export function useDismiss(
  /** Whether the popover is open. Nothing is listened. */
  open: boolean,
  /** The popover's outer element, including whatever button toggles. */
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent): void => {
      // A press inside is the reader using the thing, not leaving.
      if (ref.current !== null && !ref.current.contains(event.target as Node)) onClose()
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open, ref, onClose])
}

/** Close an open menu on a click outside it, and let that click do nothing else. */
export function useMenuClickAway(
  /** Asked at the moment of the click, so a `<details>` menu can say whether it is open. */
  isOpen: () => boolean,
  /** Every element a click may land on and still be the menu. */
  parts: readonly RefObject<HTMLElement | null>[],
  onClose: () => void,
  /** Whether to listen at all, so a closed menu holds no listener. */
  active = true,
): void {
  const state = useRef({ isOpen, parts, onClose })
  state.current = { isOpen, parts, onClose }

  useEffect(() => {
    if (!active) return
    // Heard on the window in the capture phase, before anything that would open a note or a picture.
    const away = (event: MouseEvent): void => {
      const { isOpen: open, parts: inside, onClose: close } = state.current
      if (!open()) return
      const target = event.target as Node | null
      if (target !== null && inside.some(part => part.current?.contains(target) === true)) return
      event.stopPropagation()
      event.preventDefault()
      close()
    }
    window.addEventListener('click', away, true)
    return () => window.removeEventListener('click', away, true)
  }, [active])
}
