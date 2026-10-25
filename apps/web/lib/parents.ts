'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { DEFAULT_RELAYS, type Hex, type NostrEvent, type RelayUrl } from '@nostrich/nostr'

import { getCachedEvent, rememberEvents } from './event-cache'
import { isDeleted } from './deleted'
import { getPool } from './pool'
import { parentOf } from './thread'

/** Parent ids already asked for and not found, for the lifetime of the tab. */
const attempted = new Set<Hex>()

/** Parent ids being asked for right now, by any caller, so two screens ask once. */
const inFlight = new Set<Hex>()

/** How many times each parent has been asked about, for one more look after a short answer. */
const looks = new Map<Hex, number>()
const MAX_LOOKS = 2
const LOOK_AGAIN_MS = 3_000

/** The relay each reply names for the note it answers. */
const hintsFor = new Map<Hex, RelayUrl[]>()
/** Hint relays one lookup may dial, so a page of replies cannot open a socket to every relay somebody typed. */
const MAX_HINTS = 6

function noteHint(reply: NostrEvent, parent: Hex): void {
  const hint = reply.tags.find(tag => tag[0] === 'e' && tag[1] === parent)?.[2]
  if (hint === undefined || !/^wss:\/\/\S+$/.test(hint)) return
  const held = hintsFor.get(parent) ?? []
  if (!held.includes(hint as RelayUrl)) hintsFor.set(parent, [...held, hint as RelayUrl])
}

/** The reader's relays, the hints the replies give, and the defaults. */
function lookupRelays(ids: readonly Hex[]): RelayUrl[] {
  const hints = [...new Set(ids.flatMap(id => hintsFor.get(id) ?? []))].slice(0, MAX_HINTS)
  return [...new Set([...getPool().readRelays(), ...hints, ...DEFAULT_RELAYS])]
}

/** Bumped whenever a lookup lands, so a screen waiting on an id another screen asked about hears it. */
let landed = 0
const landedListeners = new Set<() => void>()
function onLanded(listener: () => void): () => void {
  landedListeners.add(listener)
  return () => {
    landedListeners.delete(listener)
  }
}

/** The note each reply is answering, for a list of replies. */
export function useParents(replies: readonly NostrEvent[]): Map<Hex, NostrEvent> {
  return useParentLookup(replies).parents
}

/** `useParents`, plus which replies are still waiting for theirs and which have none to find. */
export function useParentLookup(replies: readonly NostrEvent[]): {
  parents: Map<Hex, NostrEvent>
  /** Replies whose parent is still being looked for. */
  waiting: Set<Hex>
  /** Replies whose parent was looked for and is nowhere. */
  missing: Set<Hex>
} {
  const [fetched, setFetched] = useState<Map<Hex, NostrEvent>>(() => new Map())
  const [round, setRound] = useState(0)
  const landedVersion = useSyncExternalStore(onLanded, () => landed, () => 0)

  /** Reply id to parent id, for the replies that name one. */
  const wanted = useMemo(() => {
    const map = new Map<Hex, Hex>()
    for (const reply of replies) {
      const parent = parentOf(reply)
      // A deleted parent stays deleted: the cache outlives the relays dropping it.
      if (parent === undefined || isDeleted(parent)) continue
      map.set(reply.id, parent)
      noteHint(reply, parent)
    }
    return map
  }, [replies])

  /** Parents not here and not known to be missing. */
  const unknown = useMemo(() => {
    const out = new Set<Hex>()
    for (const parent of wanted.values()) {
      if (getCachedEvent(parent) !== undefined || fetched.has(parent) || attempted.has(parent)) continue
      out.add(parent)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- landedVersion is the signal
  }, [wanted, fetched, landedVersion])

  const askKey = useMemo(() => [...unknown].filter(id => !inFlight.has(id)).sort().join(','), [unknown])

  // A lookup is never thrown away: on a live timeline the missing set changes every few seconds.
  useEffect(() => {
    if (askKey === '') return
    const ids = (askKey.split(',') as Hex[]).filter(id => !inFlight.has(id))
    if (ids.length === 0) return
    for (const id of ids) inFlight.add(id)
    void (async () => {
      let found: NostrEvent[] = []
      let short = false
      try {
        const outcome = await getPool().queryWithStatus([{ ids }], lookupRelays(ids), 6_000)
        found = outcome.events
        short = outcome.answered < outcome.attempted
      } catch {
        short = true
      }
      rememberEvents(found)
      const got = new Set(found.map(event => event.id))
      for (const id of ids) {
        inFlight.delete(id)
        if (got.has(id)) continue
        const looked = (looks.get(id) ?? 0) + 1
        looks.set(id, looked)
        if (!short || looked >= MAX_LOOKS) attempted.add(id)
      }
      if (short && ids.some(id => !got.has(id) && !attempted.has(id))) {
        setTimeout(() => setRound(current => current + 1), LOOK_AGAIN_MS)
      }
      setFetched(current => {
        const next = new Map(current)
        for (const event of found) next.set(event.id, event)
        return next
      })
      landed += 1
      for (const listener of landedListeners) listener()
    })()
  }, [askKey, round])

  return useMemo(() => {
    const parents = new Map<Hex, NostrEvent>()
    const waiting = new Set<Hex>()
    const missing = new Set<Hex>()
    for (const [replyId, parentId] of wanted) {
      const parent = getCachedEvent(parentId) ?? fetched.get(parentId)
      if (parent !== undefined) parents.set(replyId, parent)
      else if (unknown.has(parentId)) waiting.add(replyId)
      else missing.add(replyId)
    }
    return { parents, waiting, missing }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- landedVersion is the signal
  }, [wanted, fetched, unknown, landedVersion])
}
