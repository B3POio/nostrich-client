import { EMOJI_PACK_KIND, decodePointer, packAddress } from '@nostrich/nostr'

/** A pasted pack link to a coordinate we can fetch. */
export function parsePackLink(value: string): { address: string; relays: string[] } | undefined {
  const text = value.trim()
  if (text === '') return undefined

  const bech32 = /(?:^|[^A-Za-z0-9])(naddr1[023456789acdefghjklmnpqrstuvwxyz]{6,})/.exec(text)?.[1]
  if (bech32 !== undefined) {
    try {
      const pointer = decodePointer(bech32)
      if (pointer.type !== 'naddr' || pointer.kind !== EMOJI_PACK_KIND) return undefined
      if (pointer.identifier === '') return undefined
      return {
        address: packAddress(pointer.pubkey, pointer.identifier),
        relays: [...pointer.relays],
      }
    } catch {
      return undefined
    }
  }

  const raw = /(^|\s)(30030:[0-9a-fA-F]{64}:\S+)/.exec(text)?.[2]
  if (raw === undefined) return undefined
  const [, pubkey, ...rest] = raw.split(':')
  const identifier = rest.join(':')
  if (pubkey === undefined || identifier === '') return undefined
  return { address: packAddress(pubkey, identifier), relays: [] }
}
