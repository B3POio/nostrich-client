import { EmojiPacksScreen } from '../../components/EmojiPacksScreen'

export const metadata = {
  title: 'Emoji Packs',
  description: 'Custom emoji packs on Nostr, to use in notes, replies and messages.',
}

export default function EmojiPage(): React.ReactNode {
  return <EmojiPacksScreen />
}
