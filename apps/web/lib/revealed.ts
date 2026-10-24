'use client'

import { useEffect, useRef } from 'react'

/** Scrolls a message into view whenever it is given words, so a failure is never below the fold. */
export function useRevealed<T extends HTMLElement>(message: string | null): React.RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    // jsdom lays nothing out and has no `scrollIntoView`.
    if (message !== null) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [message])
  return ref
}
