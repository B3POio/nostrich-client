'use client'

import { useEffect, useRef } from 'react'
import {
  DEFAULT_INDEXER_RELAYS,
  RELAY_LIST_KIND,
  parseRelayList,
  type Hex,
  type NostrEvent,
  type RelayEntry,
  type RelayUrl,
} from '@nostrich/nostr'

import { getPool } from './pool'

/** Adopt the reader's own NIP-65 relay list when they sign. */

const TIMEOUT_MS = 6_000

/** Same ceiling the manual editor enforces. */
const MAX_RELAYS = 20

export interface ImportedRelays {
  urls: string[]
  updatedAt: number
  /** The list EXACTLY as published, markers and all. */
  entries: RelayEntry[]
}

/** Fetch the newest kind-10002 for this reader, as a plain list of READ relays. */
export async function fetchRelayList(pubkey: Hex): Promise<ImportedRelays | null> {
  return (await fetchPublishedRelays(pubkey)).found
}

/** The reader's published list, and whether any relay answered at all. */
export async function fetchPublishedRelays(
  pubkey: Hex,
): Promise<{ found: ImportedRelays | null; answered: boolean }> {
  const where = [...getPool().readRelays(), ...DEFAULT_INDEXER_RELAYS] as RelayUrl[]
  try {
    const outcome = await getPool().queryWithStatus(
      [{ kinds: [RELAY_LIST_KIND], authors: [pubkey], limit: 1 }] as never,
      where,
      TIMEOUT_MS,
    )
    return { found: publishedListFrom(outcome.events), answered: outcome.answered > 0 }
  } catch {
    return { found: null, answered: false }
  }
}

/** The newest list out of whatever the relays sent. */
function publishedListFrom(events: readonly NostrEvent[]): ImportedRelays | null {
  // Replaceable, so relays should send one.
  const newest = events.reduce<(typeof events)[number] | undefined>(
    (best, event) => (best === undefined || event.created_at > best.created_at ? event : best),
    undefined,
  )
  if (newest === undefined) return null

  let list
  try {
    list = parseRelayList(newest)
  } catch {
    return null
  }

  /* EVERY entry, not just the readable ones. */
  const urls = list.entries.map(entry => entry.url as string).slice(0, MAX_RELAYS)

  // A list with no readable relay is not one we can use.
  if (!list.entries.some(entry => entry.policy.read)) return null
  return urls.length === 0
    ? null
    : { urls, updatedAt: list.updatedAt, entries: [...list.entries] }
}

/** Import once per signed-in reader, per session. */
export function useImportedRelayList(
  pubkey: Hex | undefined,
  customised: boolean,
  /** Handed the WHOLE list, not just its urls. */
  apply: (found: ImportedRelays) => void,
): void {
  const done = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (pubkey === undefined || customised) return
    if (done.current === pubkey) return
    done.current = pubkey

    let alive = true
    void fetchRelayList(pubkey).then(found => {
      if (alive && found !== null) apply(found)
    })
    return () => {
      alive = false
    }
  }, [pubkey, customised, apply])
}
