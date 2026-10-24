'use client'

import Link from 'next/link'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  profileDisplayName,
  profileHandle,
  type Hex,
  type Profile,
} from '@nostrich/nostr'

import { asset } from '../lib/assets'

/** How long an account switch waits for Home before giving up and switching anyway. */
const SWITCH_DEADLINE_MS = 1_500
import { PATHS } from '@nostrich/app'

import { CHAT_BUBBLE_PATH, EXPLORE_PATH, HOME_PATH, NOTIFICATIONS_PATH, NavGlyph, PROFILE_PATH } from './icons'
import { inMoreSection, moreHref, moreLinks } from './more-links'
import { displayKey, npubOf } from '../lib/format'
import { readAccountProfile } from '../lib/account-profiles'
import { useNip05Verified, useProfile } from '../lib/profiles'
import { homePressIntent } from '../lib/home-tap'
import { revealUnread, useUnread } from '../lib/unread'
import { useAccountAlerts, useAnyAccountAlerts } from '../lib/account-alerts'
import { useNotificationsUnread, useZapsUnread } from '../lib/notifications'
import { useUnreadChatWraps } from '../lib/chat-alerts'
import { useInboxSplit } from '../lib/chat-inbox'
import { useChat } from '../lib/chat'
import { useMenuClickAway } from '../lib/dismiss'
import { Avatar } from './Avatar'
import { VerifiedBadge } from './VerifiedBadge'
import { MAX_ACCOUNTS, sessionPubkey, useSession } from './SessionProvider'
import {
  nativeShellSignOut,
  nativeShellSwitch,
  useIsNativeShell,
  useNativeShellAccounts,
} from '../lib/native-shell'

/** The navigation rail: an icon strip that grows labels where there is room for them. */

export interface NavItem {
  href: string
  label: string
  /** Material Symbols ligature name. */
  icon: string
  /** The app's own drawing, which wins over `icon`. */
  svg?: string
  /** `svg` is a filled drawing on the 256 grid rather than a stroked one. */
  filled?: boolean
  /** Needs a signer. */
  auth?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: 'home', svg: HOME_PATH },
  { href: '/explore', label: 'Explore', icon: 'search', svg: EXPLORE_PATH },
  { href: '/notifications', label: 'Notifications', icon: 'notifications', svg: NOTIFICATIONS_PATH, auth: true },
  // "Chat", not "Messages" or "DMs".
  { href: '/chat', label: 'Chat', icon: 'chat_bubble', svg: CHAT_BUBBLE_PATH, filled: true, auth: true },
  // "Wallet", not "Zaps", drawn with the zap button's own bolt.
  { href: '/zaps', label: 'Wallet', icon: 'bolt', svg: PATHS.zap, auth: true },
  { href: '/history', label: 'History', icon: 'history', auth: true },
  // `/profile` is a stand-in, not a route: the real href needs the signed-in npub.
  { href: '/profile', label: 'Profile', icon: 'person', svg: PROFILE_PATH, auth: true },
]

/** One row geometry for every item in the rail. */
const ROW = 'flex items-center rounded-lg px-3 py-3.5 transition-colors min-[1265px]:w-full'

/** The Post / Sign in pill. */
const PILL_BASE =
  'inline-flex items-center justify-center gap-2.5 rounded-full transition-colors'

/** Post: the primary action, black like every other primary action. */
const PILL = `${PILL_BASE} bg-text text-bg hover:opacity-90`

/** Sign in: black, not purple. */
const PILL_DARK = `${PILL_BASE} bg-text text-bg hover:opacity-90`

export function LeftRail({ onCompose }: { onCompose: () => void }): React.ReactNode {
  const pathname = usePathname()
  const { session, ready } = useSession()
  const pubkey = sessionPubkey(session)
  const signedIn = pubkey !== undefined

  // Every item is listed.
  const hrefOf = (item: NavItem): string => navHref(item, pubkey)
  const unread = useUnread()
  const notificationsUnread = useNotificationsUnread(pubkey)
  /** Unread chats, from whatever the session has already decrypted. */
  /** Unread chats. */
  const chat = useChat(pubkey)
  const inbox = useInboxSplit(pubkey)
  const arrivedWraps = useUnreadChatWraps(pubkey)
  /** The INBOX count, not the total. */
  const chatUnread = chat.loading ? Math.max(inbox.inboxUnread, arrivedWraps) : inbox.inboxUnread
  const zapsUnread = useZapsUnread(pubkey)
  /** Anywhere under /articles, including the editor itself. */
  const writing = pathname === '/articles' || pathname.startsWith('/articles/')

  const items = NAV_ITEMS

  return (
    /* `top-[17px]`, matching the right rail. */
    <div className="sidebar sticky top-[17px] z-40 flex h-[calc(100dvh-17px)] flex-col">
      <div className="flex flex-1 flex-col items-center min-[1265px]:items-stretch">
        {/* Takes ROW's padding so the mark lines up with the nav glyphs below. */}
        <Link href="/" aria-label="Nostrich home" className="flex items-center rounded-lg px-3 min-[1265px]:w-full">
          {/* The brand kit's own horizontal lockup, used whole rather than reassembled. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- static asset, fixed size. */}
          <img
            src={asset('/logo-horizontal.svg')}
            alt="Nostrich"
            className="hidden h-14 w-auto shrink-0 min-[1265px]:block"
          />
          {/* Icon alone on the narrow rail, where the wordmark has no room. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- static asset, fixed size. */}
          <img src={asset('/logo.svg')} alt="Nostrich" className="size-12 shrink-0 rounded-xl min-[1265px]:hidden" />
        </Link>

        <nav aria-label="Primary" className="mt-4 w-full">
          <ul className="flex flex-col items-center min-[1265px]:items-stretch">
            {items.map(item => {
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : item.href === '/profile'
                    ? pathname.startsWith('/p/')
                    : pathname.startsWith(item.href)
              return (
                <li key={item.href} className="flex w-full justify-center min-[1265px]:justify-start">
                  <Link
                    href={hrefOf(item)}
                    aria-current={active ? 'page' : undefined}
                    onClick={e => {
                      // Home is the only row that does anything here.
                      if (item.href !== '/') return
                      /* Already home -> the top. */
                      if (homePressIntent(pathname === '/') === 'return') return
                      e.preventDefault()
                      revealUnread()
                      /* The landing, said instantly. */
                      window.scrollTo({ top: 0 })
                    }}
                    className={`${ROW} gap-4 text-xl hover:bg-hover ${
                      active ? 'font-bold text-text' : 'font-normal text-text-muted'
                    }`}
                  >
                    {/* The glyph takes the nav ink rather than inheriting the row's colour: the active row. */}
                    {/* `flex`, not a bare inline span. */}
                    <span className="relative flex shrink-0 items-center text-nav-icon">
                      {item.svg === undefined ? (
                        <span className="material-symbols-outlined text-[30px]!" aria-hidden="true">
                          {item.icon}
                        </span>
                      ) : (
                        <NavGlyph path={item.svg} filled={item.filled} className="size-[28px]" weight={2.25} />
                      )}
                      {/* Offset clear of the glyph. */}
                      {dotFor(item.href, unread, notificationsUnread, chatUnread, zapsUnread) ? (
                        <span
                          aria-hidden="true"
                          /* 3px closer on both axes than it was (-6,-4 → -3,-1). */
                          className="absolute -right-[3px] -top-[1px] size-2 rounded-full bg-[#f97315] ring-2 ring-bg"
                        />
                      ) : null}
                    </span>
                    {/* `leading-none` so the label's box is the glyph height too, rather than text-xl's. */}
                    <span className="hidden leading-none min-[1265px]:inline">{item.label}</span>
                    {item.href === '/' && unread > 0 ? (
                      <span className="sr-only">
                        {unread} new {unread === 1 ? 'note' : 'notes'}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
            <MoreMenu pubkey={pubkey} />
          </ul>
        </nav>

        {/* `pl-3` matches the `px-3` every nav row and the wordmark carry. */}
        <div className="mt-4 flex w-full justify-center min-[1265px]:block min-[1265px]:pl-3">
          {/* On Articles the primary action is a different KIND of writing. */}
          {signedIn ? (
            writing ? (
              <Link
                href="/articles/new"
                aria-label="Write an article"
                className={`${PILL} size-12 min-[1265px]:size-auto min-[1265px]:w-[240px] min-[1265px]:px-3 min-[1265px]:py-3`}
              >
                <span className="material-symbols-outlined text-2xl! min-[1265px]:hidden!" aria-hidden="true">
                  edit_square
                </span>
                <span className="hidden text-xl font-bold min-[1265px]:inline">Write</span>
                <span className="sr-only min-[1265px]:hidden">Write an article</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={onCompose}
                className={`${PILL} size-12 min-[1265px]:size-auto min-[1265px]:w-[240px] min-[1265px]:px-3 min-[1265px]:py-3`}
              >
                <span className="material-symbols-outlined text-2xl! min-[1265px]:hidden!" aria-hidden="true">
                  edit_square
                </span>
                <span className="hidden text-xl font-bold min-[1265px]:inline">Post</span>
                <span className="sr-only min-[1265px]:hidden">Write a note</span>
              </button>
            )
          ) : (
            <Link href="/login" className={`${PILL_DARK} size-12 min-[1265px]:size-auto min-[1265px]:w-[240px] min-[1265px]:px-3 min-[1265px]:py-3`}>
              <span className="material-symbols-outlined text-2xl! min-[1265px]:hidden!" aria-hidden="true">
                login
              </span>
              <span className="hidden text-xl font-bold min-[1265px]:inline">Sign In</span>
              <span className="sr-only min-[1265px]:hidden">Sign In</span>
            </Link>
          )}
        </div>
      </div>

      {/* 25px off the bottom edge. */}
      {ready && signedIn ? (
        <div className="mb-[25px] flex w-full justify-center min-[1265px]:block">
          <AccountBlock pubkey={pubkey} />
        </div>
      ) : null}
    </div>
  )
}

/** More: an upward popover of the rows that live behind it, portalled so its shadow is not clipped. */
function MoreMenu({ pubkey }: { pubkey: Hex | undefined }): React.ReactNode {
  const pathname = usePathname()
  const ref = useRef<HTMLDetailsElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ left: number; bottom: number } | null>(null)
  const active = inMoreSection(pathname)

  const close = (): void => {
    if (ref.current !== null) ref.current.open = false
    setOpen(false)
  }

  // Measured from the row, so the panel's rows land on the rail's own alignment.
  const place = (): void => {
    const row = ref.current?.querySelector('summary')
    if (row == null) return
    const rect = row.getBoundingClientRect()
    setBox({ left: rect.left - 1, bottom: window.innerHeight - rect.top + 8 })
  }

  useMenuClickAway(() => ref.current?.open === true, [ref, panelRef], close)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    // A scroll detaches the panel from its row, so it closes.
    const onScroll = (): void => close()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <li className="flex w-full justify-center min-[1265px]:justify-start">
      <div className="min-[1265px]:w-full">
        <details
          ref={ref}
          onToggle={event => {
            const next = event.currentTarget.open
            if (next) place()
            setOpen(next)
          }}
        >
          <summary
            aria-label="More"
            className={`${ROW} cursor-pointer list-none gap-4 text-xl hover:bg-hover [&::-webkit-details-marker]:hidden ${
              active ? 'font-bold text-text' : 'font-normal text-text-muted'
            }`}
          >
            {/* Three dots in a circle, at the weight of every other glyph in the rail. */}
            <span className="relative flex shrink-0 items-center text-nav-icon">
              <span className="material-symbols-outlined text-[30px]!" aria-hidden="true">
                pending
              </span>
            </span>
            <span className="hidden leading-none min-[1265px]:inline">More</span>
          </summary>
        </details>

        {open && box !== null && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={panelRef}
                style={{ left: box.left, bottom: box.bottom }}
                className="panel-shadow fixed z-[90] w-[260px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border bg-bg py-1.5 dark:bg-bg-elevated"
              >
                {moreLinks().map(link => {
                  const current = pathname === link.href || pathname.startsWith(`${link.href}/`)
                  return (
                    <Link
                      key={link.href}
                      href={moreHref(link, pubkey !== undefined)}
                      onClick={close}
                      aria-current={current ? 'page' : undefined}
                      className={`${ROW} w-full gap-4 text-xl hover:bg-hover ${
                        current ? 'font-bold text-text' : 'font-normal text-text-muted'
                      }`}
                    >
                      <span className="relative flex shrink-0 items-center text-nav-icon">
                        {link.svg === undefined ? (
                          <span className="material-symbols-outlined text-[30px]!" aria-hidden="true">
                            {link.icon}
                          </span>
                        ) : (
                          <NavGlyph path={link.svg} className="size-[28px]" weight={2.25} />
                        )}
                      </span>
                      <span className="leading-none">{link.label}</span>
                    </Link>
                  )
                })}
              </div>,
              document.body,
            )
          : null}
      </div>
    </li>
  )
}

/** Where a nav item actually points, for this reader. */
export function navHref(item: NavItem, pubkey: Hex | undefined): string {
  if (item.auth === true && pubkey === undefined) return '/login'
  if (item.href === '/profile') return pubkey === undefined ? '/login' : `/p/${npubOf(pubkey)}`
  return item.href
}

/** The signed-in account, and the switcher behind. */
export function AccountBlock({
  pubkey,
  expanded = false,
}: {
  pubkey: Hex
  /** Show the name, handle and badge regardless of viewport width. */
  expanded?: boolean
}): React.ReactNode {
  const { accounts, switchTo, signOut } = useSession()
  const router = useRouter()
  // Read for one decision only: whether an account switch should stay.
  const pathname = usePathname()
  /* Inside the native app the accounts are in the phone's keychain, not in this page's. */
  const shell = useIsNativeShell()
  const shellAccounts = useNativeShellAccounts()
  const atCapacity = (shell ? shellAccounts.length : accounts.length) >= MAX_ACCOUNTS
  // Same fallback as the rows in the menu below: the reader's own name does.
  const liveProfile = useProfile(pubkey)
  const profile = liveProfile ?? readAccountProfile(pubkey) ?? null
  const verified = useNip05Verified(profile?.nip05, pubkey)
  const ref = useRef<HTMLDetailsElement>(null)

  /** THE NEW IDENTITY ARRIVES AFTER THE NAVIGATION. */
  const pending = useRef<Hex | null>(null)
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (pending.current === null || pathname !== '/') return
    const next = pending.current
    pending.current = null
    if (deadline.current !== undefined) clearTimeout(deadline.current)
    switchTo(next)
  }, [pathname, switchTo])

  useEffect(() => () => {
    if (deadline.current !== undefined) clearTimeout(deadline.current)
  }, [])

  useMenuClickAway(
    () => ref.current?.open === true,
    [ref],
    () => {
      if (ref.current !== null) ref.current.open = false
    },
  )

  const close = (): void => {
    if (ref.current !== null) ref.current.open = false
  }

  const others = shell
    ? shellAccounts
        .filter(held => held !== pubkey)
        .map(held => ({ pubkey: held, persistent: true }))
    : accounts.filter(account => account.pubkey !== pubkey)
  /** "Something happened on one of your other accounts." The dot sits on the ⋯ rather. */
  const otherKeys = useMemo(() => others.map(account => account.pubkey), [others])
  const elsewhere = useAnyAccountAlerts(otherKeys)

  return (
    /* `w-full` only on the wide rail. */
    <div className={`relative ${expanded ? 'w-full' : 'min-[1265px]:w-full'}`}>
      <details ref={ref}>
        <summary
          aria-label="Account menu"
          className={`${ROW} cursor-pointer list-none gap-3 hover:bg-hover [&::-webkit-details-marker]:hidden`}
        >
          {/* Same 44px as a note card's avatar, so the rail's account block and the timeline. */}
          <Avatar
            pubkey={pubkey}
            name={profileDisplayName(profile ?? { pubkey })}
            picture={profile?.picture}
            size="lg"
          />
          <span className={`min-w-0 flex-1 ${expanded ? 'block' : 'hidden min-[1265px]:block'}`}>
            {/* Display name over handle, the way every social client orders it: the name. */}
            <span className="flex min-w-0 items-center gap-1">
              {/* 16px, a point up. */}
              <span className="min-w-0 truncate text-[16px] font-semibold text-text">
                {profileDisplayName(profile ?? { pubkey })}
              </span>
              {/* Same asset as the profile header and the timeline. */}
              {verified ? (
                <VerifiedBadge size={15} mine />
              ) : null}
            </span>
            <span className="block truncate text-[13px] text-text-faint">
              {handleFor(pubkey, profile)}
            </span>
          </span>
          <span
            className={`relative text-xl font-bold leading-none text-text-faint ${
              expanded ? 'inline' : 'hidden min-[1265px]:inline'
            }`}
          >
            <span aria-hidden="true">···</span>
            {elsewhere ? (
              <>
                {/* Above the ⋯, in the same orange as every other "there is something new" dot. */}
                <span
                  aria-hidden="true"
                  className="absolute -top-[3px] left-1/2 size-2 -translate-x-1/2 rounded-full bg-[#f97315] ring-2 ring-bg"
                />
                <span className="sr-only">Another account has something new</span>
              </>
            ) : null}
          </span>
        </summary>

          {/* Opens UPWARD. */}
          <div /* 260px, but never wider than the room it has. */
            /* `panel-shadow`, not Tailwind's `shadow-lg`. */
            className={`panel-shadow absolute bottom-full left-0 z-50 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-lg border border-border bg-bg-elevated py-1 ${
              /* In the drawer the panel FILLS its host, so the gap either side. */
              expanded ? 'mb-[18px] w-full' : 'mb-2 w-[260px]'
            }`}>
            {others.length > 0 ? (
              <>
                {others.map(account => (
                  <AccountRow
                    key={account.pubkey}
                    pubkey={account.pubkey}
                    persistent={account.persistent}
                    onClick={() => {
                      /* In the app the switch happens where the keys. */
                      if (shell) {
                        nativeShellSwitch(account.pubkey)
                        close()
                        return
                      }
                      close()
                      /** Straight to the timeline. */
                      /* Already where the switch would send us. */
                      if (pathname === '/' || pathname.startsWith('/deck')) {
                        switchTo(account.pubkey)
                        return
                      }
                      // See `pending`: navigate first, adopt the identity when Home is on screen.
                      pending.current = account.pubkey
                      deadline.current = setTimeout(() => {
                        if (pending.current === null) return
                        const next = pending.current
                        pending.current = null
                        switchTo(next)
                      }, SWITCH_DEADLINE_MS)
                      router.push('/')
                    }}
                  />
                ))}
                <div className="my-1 border-t border-border" />
              </>
            ) : null}

            {/* Said before the click. */}
            {atCapacity ? (
              <p className="px-4 py-2.5 text-xs text-text-faint">
                You&rsquo;ve reached the {MAX_ACCOUNTS}-account limit. Log out of an account to
                add another.
              </p>
            ) : (
              <Link
                href="/login"
                onClick={close}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-text transition-colors hover:bg-hover"
              >
                <span className="material-symbols-outlined text-[20px]!" aria-hidden="true">
                  person_add
                </span>
                Add an existing account
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                /* The app has to forget the key too. */
                if (shell) nativeShellSignOut(pubkey)
                signOut()
                close()
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-danger-text transition-colors hover:bg-hover"
            >
              <span className="material-symbols-outlined text-[20px]!" aria-hidden="true">
                logout
              </span>
            Log out {handleFor(pubkey, profile)}
          </button>
        </div>
      </details>
    </div>
  )
}

function AccountRow({
  pubkey,
  persistent,
  onClick,
}: {
  pubkey: Hex
  persistent: boolean
  onClick: () => void
}): React.ReactNode {
  /* The durable copy stands in whenever the live one is not there yet. */
  const live = useProfile(pubkey)
  const profile = live ?? readAccountProfile(pubkey) ?? null
  const verified = useNip05Verified(profile?.nip05, pubkey)
  const alerts = useAccountAlerts(pubkey)
  const waiting = [
    alerts.notifications ? 'notifications' : undefined,
    alerts.zaps ? 'zaps' : undefined,
    alerts.chats ? 'messages' : undefined,
  ].filter((item): item is string => item !== undefined)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-hover"
    >
      {/* On the AVATAR here, unlike the block above. */}
      <span className="relative shrink-0">
        <Avatar
          pubkey={pubkey}
          name={profileDisplayName(profile ?? { pubkey })}
          picture={profile?.picture}
          size="sm"
        />
        {waiting.length > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-[2px] -top-[2px] size-2.5 rounded-full bg-[#f97315] ring-2 ring-bg-elevated"
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-[15px] font-semibold text-text">
            {profileDisplayName(profile ?? { pubkey })}
          </span>
          {verified ? (
            <VerifiedBadge size={15} mine />
          ) : null}
        </span>
        <span className="block truncate text-xs text-text-faint">
          {/* Said out loud rather than discovered on the next reload. */}
          {persistent ? handleFor(pubkey, profile) : 'this session only'}
        </span>
      </span>
      {waiting.length > 0 ? <span className="sr-only">New {waiting.join(', ')}</span> : null}
    </button>
  )
}

/** The @handle line, with a short npub as this surface's last resort. */
function handleFor(pubkey: Hex, profile: Profile | null): string {
  const handle = profileHandle(profile)
  return handle === undefined ? displayKey(pubkey) : `@${handle}`
}

/** Whether a nav row has something waiting behind. */
function dotFor(
  href: string,
  feed: number,
  notifications: number,
  chat: number,
  zaps: number,
): boolean {
  if (href === '/') return feed > 0
  if (href === '/notifications') return notifications > 0
  if (href === '/chat') return chat > 0
  // A zap lights this AND notifications: it is both money arriving and somebody.
  if (href === '/zaps') return zaps > 0
  return false
}
