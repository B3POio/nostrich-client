import { Suspense } from 'react'

import { EmojiPacksScreen } from '../../components/EmojiPacksScreen'

export const metadata = {
  title: 'Emoji Packs',
  description: 'Custom emoji packs on Nostr, to use in notes, replies and messages.',
}

export default function EmojiPage(): React.ReactNode {
  // The active tab is read from the URL, so this reads useSearchParams.
  return (
    <Suspense fallback={null}>
      <EmojiPacksScreen />
    </Suspense>
  )
}
