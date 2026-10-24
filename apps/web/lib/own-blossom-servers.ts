'use client'

import { DEFAULT_INDEXER_RELAYS, DEFAULT_RELAYS, type Hex, type RelayUrl } from '@nostrich/nostr'

import { getPool } from './pool'

/** The reader's own list, asked alone, where nobody answering is an error rather than "no list". */
export function ownBlossomServersQuery(pubkey: Hex) {
  return {
    queryKey: ['own-blossom-servers', pubkey] as const,
    queryFn: async (): Promise<string[]> => {
      const pool = getPool()
      const where = [...new Set<RelayUrl>([...pool.readRelays(), ...DEFAULT_RELAYS, ...DEFAULT_INDEXER_RELAYS])]
      const outcome = await pool.queryWithStatus(
        [{ kinds: [10063], authors: [pubkey], limit: 1 }] as never,
        where,
        6_000,
      )
      if (outcome.answered === 0) throw new Error('No relay answered for the media server list')
      const newest = outcome.events.reduce<(typeof outcome.events)[number] | undefined>(
        (best, event) =>
          event.pubkey === pubkey && (best === undefined || event.created_at > best.created_at) ? event : best,
        undefined,
      )
      if (newest === undefined) return []
      return newest.tags
        .filter(tag => tag[0] === 'server' && typeof tag[1] === 'string')
        .map(tag => (tag[1] as string).replace(/\/+$/, ''))
        .filter(url => /^https:\/\//i.test(url))
        .slice(0, 8)
    },
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
  }
}
