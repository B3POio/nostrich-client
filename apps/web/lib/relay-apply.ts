'use client'

import { useEffect } from 'react'

import type { Hex } from '@nostrich/nostr'

import { fetchPublishedRelays } from './relay-list-import'
import { adoptPublishedRelays, applyRelaysToPool } from './relay-prefs'
import { parseRelayCookie } from './relay-cookie'
import { onScopedChange, resolveScope } from './scope'

const COOKIE = 'nostrich_relays'

/** When no relay answered, the reader's list is asked for again after these waits. */
const PUBLISHED_RETRY_MS: readonly number[] = [20_000, 90_000]

const HEX64 = /^[0-9a-f]{64}$/

/** Hand the stored relay list to the pool on load, and adopt the reader's published list. */
export function useStoredRelays(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return
    const match = document.cookie.split('; ').find(row => row.startsWith(`${COOKIE}=`))
    if (match !== undefined) {
      const stored = parseRelayCookie(decodeURIComponent(match.slice(COOKIE.length + 1)))
      if (stored !== null) applyRelaysToPool(stored.urls, stored.policies ?? {})
    }

    let alive = true
    const asked = new Set<string>()
    const timers = new Set<ReturnType<typeof setTimeout>>()

    const ask = (owner: string, attempt: number): void => {
      void fetchPublishedRelays(owner as Hex).then(({ found, answered }) => {
        if (!alive) return
        // An answer for an account that is no longer in front is asked again when it is back.
        if (resolveScope() !== owner) {
          asked.delete(owner)
          return
        }
        if (found !== null) {
          adoptPublishedRelays(found)
          return
        }
        // "Nobody answered" is not "no list", so it is asked again a little later.
        const wait = answered ? undefined : PUBLISHED_RETRY_MS[attempt]
        if (wait === undefined) return
        const timer = setTimeout(() => {
          timers.delete(timer)
          if (!alive) return
          if (resolveScope() === owner) ask(owner, attempt + 1)
          else asked.delete(owner)
        }, wait)
        timers.add(timer)
      })
    }

    const published = (): void => {
      const owner = resolveScope()
      if (!HEX64.test(owner) || asked.has(owner)) return
      asked.add(owner)
      ask(owner, 0)
    }

    published()
    // Fires on every sign-in and account switch.
    const off = onScopedChange(published)
    return () => {
      alive = false
      off()
      for (const timer of timers) clearTimeout(timer)
    }
  }, [])
}
