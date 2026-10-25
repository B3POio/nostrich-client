/** The feed tab vocabulary, and the rule that decides which one a reader lands. */
import { KINDS, isReply, type NostrEvent } from '@nostrich/nostr'

/** `replies` is what the people you follow answer, each drawn under the note it answers. */
export type FeedTabId = 'follows' | 'replies' | 'latest' | 'trending' | 'custom' | 'list'

export function tabFromParam(raw: string | null): FeedTabId | null {
  switch (raw) {
    case 'follows':
    // The first release spelled it "following".
    case 'following':
      return 'follows'
    case 'replies':
      return 'replies'
    case 'trending':
      return 'trending'
    case 'custom':
      return 'custom'
    case 'list':
      return 'list'
    case 'latest':
    // `verified`, `discover` and `global` all shipped at some point.
    case 'verified':
    case 'discover':
    case 'global':
      return 'latest'
    default:
      return null
  }
}

/** Which feed a reader lands. */
export function resolveTab({
  requested,
  signedIn,
  customMissing,
  listMissing = false,
  hasFollows,
}: {
  /** The `feed` URL parameter, already normalised. */
  requested: FeedTabId | null
  signedIn: boolean
  /** A `custom` route naming a feed this device does. */
  customMissing: boolean
  /** A `list` route naming a list nobody could find. */
  listMissing?: boolean
  /** Whether the reader has a contact list. */
  hasFollows: boolean
}): FeedTabId {
  /** Where a reader lands when they have not asked for anywhere in particular. */
  const fallback: FeedTabId = hasFollows ? 'latest' : 'trending'

  /* An EXPLICIT request always wins, including a signed-out reader asking for Latest. */
  if (requested === 'custom') return customMissing ? fallback : 'custom'
  if (requested === 'list') return listMissing ? fallback : 'list'
  if ((requested === 'follows' || requested === 'replies') && !signedIn) return fallback
  if (requested !== null) return requested
  return signedIn && hasFollows ? 'follows' : fallback
}

/** A row the Replies tab draws: a note that answers another, never a plain post, repost or quote. */
export function isReplyRow(event: NostrEvent): boolean {
  return event.kind === KINDS.shortNote && isReply(event)
}
