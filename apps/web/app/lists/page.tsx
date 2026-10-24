import { ListsScreen } from '../../components/ListsScreen'

export const metadata = {
  title: 'Lists',
  description: 'Your people lists on Nostr, public and private.',
}

export default function ListsPage(): React.ReactNode {
  return <ListsScreen />
}
