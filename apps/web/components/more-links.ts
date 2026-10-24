/** What lives behind More: places a reader visits on purpose, not mid-scroll. */
import { ARTICLES_PATH, DOWNLOADS_PATH, SETTINGS_PATH } from './icons'

export interface MoreLink {
  href: string
  label: string
  /** Material Symbols ligature, used when there is no drawing. */
  icon: string
  /** The app's own drawing, which wins over `icon`. */
  svg?: string
  /** Needs a signed-in reader, and points at `/login` until there is one. */
  auth?: boolean
}

/** Settings, a row of its own under Profile in the phone drawer and the last row of More on the rail. */
export const SETTINGS_LINK: MoreLink = { href: '/settings', label: 'Settings', icon: 'settings', svg: SETTINGS_PATH }

/** Every row, in the order the rail and the drawer draw them. */
export const MORE_LINKS: readonly MoreLink[] = [
  { href: '/articles', label: 'Articles', icon: 'article', svg: ARTICLES_PATH },
  { href: '/downloads', label: 'Downloads', icon: 'download', svg: DOWNLOADS_PATH },
  SETTINGS_LINK,
]

/** The rows behind More, without Settings where it is a row of its own. */
export function moreLinks(settingsInMenu = false): MoreLink[] {
  return MORE_LINKS.filter(link => !(settingsInMenu && link.href === '/settings'))
}

/** Whether the More row reads as the active one. */
export function inMoreSection(pathname: string, settingsInMenu = false): boolean {
  return moreLinks(settingsInMenu).some(link => pathname === link.href || pathname.startsWith(`${link.href}/`))
}

/** Where a More row points for this reader. */
export function moreHref(link: MoreLink, signedIn: boolean): string {
  return link.auth === true && !signedIn ? '/login' : link.href
}
