import type { Metadata } from 'next'

import { ContentLink } from '../../components/ContentLink'
import { DOWNLOADS_PATH } from '../../components/icons'
import { APK_FILE, APK_URL } from '../../lib/downloads'
import { PAGE, PAGE_TITLE } from '../../lib/styles'

export const metadata: Metadata = {
  title: 'Downloads',
  description: 'Nostrich for iPhone, iPad, Android and Mac.',
}

interface Store {
  name: string
  detail: string
  /** Material Symbols ligature. */
  icon: string
  href: string
  badge: string
  badgeAlt: string
}

const STORES: Store[] = [
  {
    name: 'iOS',
    detail: 'iPhone and iPad',
    icon: 'phone_iphone',
    href: 'https://apps.apple.com/app/nostrich-nostr-client/id6807898323',
    badge: '/badges/app-store.svg',
    badgeAlt: 'Download on the App Store',
  },
  {
    name: 'Android',
    detail: 'Phones and tablets',
    icon: 'android',
    href: 'https://play.google.com/store/apps/details?id=org.nostrich.app',
    badge: '/badges/google-play.svg',
    badgeAlt: 'Get it on Google Play',
  },
  {
    name: 'Zapstore',
    detail: 'The Nostr-native app store',
    icon: 'bolt',
    href: 'https://zapstore.dev/apps/org.nostrich.app',
    badge: '/badges/zapstore.svg',
    badgeAlt: 'Get it on Zapstore',
  },
  {
    name: 'MacOS',
    detail: 'Apple silicon native Mac app',
    icon: 'laptop_mac',
    href: 'https://apps.apple.com/app/nostrich-deck-nostr-client/id6818159675?mt=12',
    badge: '/badges/mac-app-store.svg',
    badgeAlt: 'Download on the Mac App Store',
  },
]

const APK_STEPS = [
  'Tap Download APK.',
  'Open the file from your notifications or the Files app.',
  'If Android asks, turn on Allow from this source.',
  'Tap Install.',
]

const ROW = 'flex items-center gap-4 rounded-lg border border-border bg-bg-elevated px-4 py-3.5 sm:px-5'
/* Every badge is the same 160 by 48 box. */
const BADGE = 'block h-12 w-40 shrink-0 max-[380px]:h-[42px] max-[380px]:w-[140px]'

export default function DownloadsPage(): React.ReactNode {
  return (
    <div className={PAGE}>
      <h1 className={PAGE_TITLE}>Download Nostrich</h1>

      <ul className="mt-5 space-y-2.5">
        {STORES.map(store => (
          <li key={store.name} className={ROW}>
            <span className="material-symbols-outlined shrink-0 text-[28px]! text-text" aria-hidden="true">
              {store.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold text-text">{store.name}</span>
              <span className="block text-sm text-text-muted">{store.detail}</span>
            </span>
            {/* `ContentLink` opens another origin in a new tab. */}
            <ContentLink href={store.href} className={`${BADGE} rounded-md hover:opacity-85`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static badge artwork. */}
              <img src={store.badge} alt={store.badgeAlt} className="h-full w-full" />
            </ContentLink>
          </li>
        ))}
      </ul>

      <section className="mt-6 rounded-lg border border-border bg-bg-elevated px-4 py-4 sm:px-5 sm:py-5">
        <h2 className="font-brand text-lg font-bold text-text">Direct APK download</h2>
        <p className="mt-1 text-sm leading-relaxed text-text-muted">
          Direct installation for Android phones and tablets without Google Play.
        </p>

        <a
          href={APK_URL}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-text px-4 text-[15px] font-semibold text-bg hover:opacity-90"
        >
          {/* The menu's own Downloads drawing. */}
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0"
          >
            <path d={DOWNLOADS_PATH} />
          </svg>
          Download APK
        </a>
        <p className="mt-2 text-xs break-all text-text-faint">{APK_FILE}</p>

        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-text">How to install an APK</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-text-muted">
            {APK_STEPS.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-2 text-text-muted">
            APK installs don&apos;t update on their own. Use Zapstore to get updates automatically.
          </p>
        </details>
      </section>

      <p className="mt-6 text-xs leading-relaxed text-text-faint">
        Nostrich is a free and open-source Nostr client. Your keys stay on your device, always.
        <br />
        Notes, profiles and media live on Nostr relays and are not hosted by Nostrich.
      </p>
    </div>
  )
}
