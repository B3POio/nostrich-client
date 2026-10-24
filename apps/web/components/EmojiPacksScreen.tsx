'use client'

import { useEffect, useRef, useState } from 'react'
import { MAX_PACKS_PER_READER, profileDisplayName, type EmojiPack, type Hex } from '@nostrich/nostr'

import { ACTION_PILL, BUTTON_PRIMARY, BUTTON_QUIET, CARD, PAGE, PAGE_TITLE, PILL_BASE, PILL_OFF, PILL_ON } from '../lib/styles'
import {
  EmojiListError,
  distinctPacks,
  fetchRequestedPack,
  matchesPackQuery,
  rankPackMatches,
  useBrowsableEmojiPacks,
  useEmojiPackSearch,
  useEmojiSet,
} from '../lib/emoji-packs'
import { parsePackLink } from '../lib/emoji-pack-link'
import { openModal } from '../lib/modal'
import { useProfile } from '../lib/profiles'
import { useTabParam } from '../lib/tab-param'
import { Avatar } from './Avatar'
import { EmojiThumb } from './EmojiThumb'
import { PlusGlyph } from './icons'
import { Spinner } from './Spinner'

/** The emoji packs page: what the reader has, what they could add, and a box to search with. */

/** How many cards a page of the shelf draws. */
const PAGE_SIZE = 30

/** How many of a pack's emoji a card samples. */
const PREVIEW = 8

/** How many emoji a pack must actually draw to stay on the shelf. */
const MIN_LIVE_PREVIEW = 4

type View = 'all' | 'mine'
const VIEWS: { id: View; label: string }[] = [
  { id: 'all', label: 'Emoji Packs' },
  { id: 'mine', label: 'My Packs' },
]
const VIEW_IDS: readonly View[] = VIEWS.map(entry => entry.id)

export function EmojiPacksScreen(): React.ReactNode {
  const { packs, selection, emoji, has, toggle, canEdit, saving, loading, error } = useEmojiSet()
  const browse = useBrowsableEmojiPacks()

  const [query, setQuery] = useState('')
  const searching = query.trim().length > 0
  const found = useEmojiPackSearch(query)
  const [view, setView] = useTabParam<View>(VIEW_IDS, 'all', 'view')

  /** Packs with nothing left to show, dropped from Browse only. */
  const [dead, setDead] = useState<ReadonlySet<string>>(() => new Set())
  const [adding, setAdding] = useState(false)
  const [pages, setPages] = useState(1)

  const owned = [...packs.values()]
  const mine = owned.filter(pack => !searching || matchesPackQuery(pack, query))
  const local = distinctPacks(
    browse.packs.filter(pack => !has(pack.address) && !dead.has(pack.address)),
    owned,
  )
  const shelf = searching
    ? (() => {
        const hits = local.filter(pack => matchesPackQuery(pack, query))
        const seen = new Set(hits.map(pack => pack.address))
        for (const pack of found.packs) {
          if (seen.has(pack.address) || has(pack.address) || dead.has(pack.address)) continue
          seen.add(pack.address)
          hits.push(pack)
        }
        return rankPackMatches(distinctPacks(hits, owned), query)
      })()
    : local

  const full = selection.packs.length >= MAX_PACKS_PER_READER

  useEffect(() => {
    setPages(1)
  }, [query, view])

  const list = view === 'mine' ? mine : shelf
  const drawn = list.slice(0, pages * PAGE_SIZE)
  const rest = list.length - drawn.length
  const waiting = view === 'mine' ? loading : searching ? browse.loading && found.loading : browse.loading

  return (
    <div className={PAGE}>
      <div className="flex items-start justify-between gap-[18px]">
        <h1 className={PAGE_TITLE}>Emoji Packs</h1>
        {canEdit ? (
          <button type="button" onClick={() => setAdding(true)} className={ACTION_PILL}>
            <PlusGlyph />
            Add pack
          </button>
        ) : null}
      </div>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-text-muted">
        Add custom emoji packs and use them in notes, replies and messages. Type a colon to find one.
      </p>

      {!canEdit ? <Notice>Sign in with a key or a signer to add packs.</Notice> : null}
      <SaveError error={error} />
      {full ? <Notice>{`You have the most packs a list can hold (${MAX_PACKS_PER_READER}). Remove one to add another.`}</Notice> : null}

      <label htmlFor="emoji-pack-search" className="sr-only">
        Search emoji packs
      </label>
      <input
        id="emoji-pack-search"
        type="search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Search emoji packs"
        autoComplete="off"
        className="mt-4 w-full rounded-lg border border-border bg-bg-inset py-2.5 pl-4 pr-4 text-text placeholder:text-text-faint focus:outline-none"
      />

      <div role="tablist" aria-label="Emoji Packs" className="mt-4 flex gap-1">
        {VIEWS.map(entry => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={view === entry.id}
            onClick={() => setView(entry.id)}
            className={`${PILL_BASE} ${view === entry.id ? PILL_ON : PILL_OFF}`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <section className="mt-5">
        {waiting || (list.length === 0 && view === 'all' && found.loading) ? (
          <Spinner label="Loading emoji packs" className="py-6" />
        ) : list.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            {view === 'mine'
              ? 'You have not added any emoji packs yet.'
              : searching
                ? `No emoji packs match "${query.trim()}".`
                : 'No emoji packs could be found right now.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {drawn.map(pack => (
              <li key={pack.address}>
                <PackCard
                  pack={pack}
                  added={view === 'mine'}
                  onToggle={() => toggle(pack)}
                  busy={saving}
                  canEdit={canEdit}
                  fallback={view === 'mine' ? 'chip' : 'none'}
                  minLive={view === 'mine' ? 0 : MIN_LIVE_PREVIEW}
                  onTooFew={() => setDead(held => (held.has(pack.address) ? held : new Set(held).add(pack.address)))}
                />
              </li>
            ))}
          </ul>
        )}
        {rest > 0 ? (
          <button type="button" onClick={() => setPages(current => current + 1)} className={`mt-3 w-full ${BUTTON_QUIET}`}>
            {`Show ${Math.min(rest, PAGE_SIZE)} more`}
          </button>
        ) : null}
        {view === 'mine' && emoji.length > 0 ? (
          <p className="mt-3 text-sm text-text-faint">{emoji.length === 1 ? '1 emoji' : `${emoji.length} emoji`}</p>
        ) : null}
      </section>

      {adding ? <AddPackModal onClose={() => setAdding(false)} /> : null}
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }): React.ReactNode {
  return <p className="mt-4 rounded-lg border border-border bg-bg-inset px-3 py-2 text-sm text-text-muted">{children}</p>
}

function SaveError({ error }: { error: Error | null }): React.ReactNode {
  if (error === null) return null
  const message =
    error instanceof EmojiListError && error.reason === 'unreachable'
      ? 'Your emoji list could not be read, so nothing was changed. Try again in a moment.'
      : 'No relay accepted the change.'
  return (
    <p role="alert" className="mt-4 rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text">
      {message}
    </p>
  )
}

/** Add by link, in a dialog behind the Add pack button. */
function AddPackModal({ onClose }: { onClose: () => void }): React.ReactNode {
  const { toggle, canEdit, has, error } = useEmojiSet()
  const ref = useRef<HTMLDialogElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [state, setState] = useState<'idle' | 'looking' | 'invalid' | 'missing'>('idle')

  useEffect(() => {
    openModal(ref.current, fieldRef.current)
  }, [])

  const submit = async (): Promise<void> => {
    const parsed = parsePackLink(value)
    if (parsed === undefined) {
      setState('invalid')
      return
    }
    if (has(parsed.address)) {
      onClose()
      return
    }
    setState('looking')
    const pack = await fetchRequestedPack(parsed.address, parsed.relays[0])
    if (pack === undefined) {
      setState('missing')
      return
    }
    toggle(pack, parsed.relays[0])
    onClose()
  }

  return (
    <dialog
      tabIndex={-1}
      ref={ref}
      onClose={onClose}
      onClick={event => {
        if (event.target === ref.current) onClose()
      }}
      aria-label="Add a pack by link"
      className={`${CARD} m-auto w-[min(480px,92vw)] p-0 backdrop:bg-[rgb(0_0_0/0.6)] open:animate-none`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-text">Add a pack by link</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-inset hover:text-text"
        >
          <span className="material-symbols-outlined text-[20px]!" aria-hidden="true">
            close
          </span>
        </button>
      </div>
      <form
        className="px-4 py-4"
        onSubmit={event => {
          event.preventDefault()
          void submit()
        }}
      >
        <label htmlFor="emoji-pack-link" className="sr-only">
          Pack link
        </label>
        <input
          id="emoji-pack-link"
          ref={fieldRef}
          value={value}
          onChange={event => {
            setValue(event.target.value)
            setState('idle')
          }}
          placeholder="naddr1… or 30030:…"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-border bg-bg-inset px-3 py-2.5 font-mono text-[16px] text-text placeholder:text-text-faint focus:outline-none"
        />
        {state === 'invalid' ? <p className="mt-2 text-sm text-danger-text">That is not a link to an emoji pack.</p> : null}
        {state === 'missing' ? <p className="mt-2 text-sm text-danger-text">That pack could not be found on any relay.</p> : null}
        <SaveError error={error} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BUTTON_QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={!canEdit || value.trim() === '' || state === 'looking'} className={BUTTON_PRIMARY}>
            {state === 'looking' ? 'Looking…' : 'Add'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

function PackCard({
  pack,
  added,
  onToggle,
  busy,
  canEdit,
  fallback,
  minLive,
  onTooFew,
}: {
  pack: EmojiPack
  added: boolean
  onToggle: () => void
  busy: boolean
  canEdit: boolean
  /** `chip` draws a dead emoji as its code; `none` drops it and shows the next one. */
  fallback: 'chip' | 'none'
  /** Below this many drawable emoji the card is not worth offering. */
  minLive: number
  onTooFew: () => void
}): React.ReactNode {
  const author = useProfile(pack.pubkey as Hex)
  const name = profileDisplayName(author ?? { pubkey: pack.pubkey as Hex })

  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const usable = pack.emoji.filter(item => !failed.has(item.url))
  const shown = usable.slice(0, PREVIEW)
  const rest = pack.emoji.length - shown.length
  const tooFew = usable.length < Math.min(minLive, pack.emoji.length)

  useEffect(() => {
    if (tooFew) onTooFew()
  }, [tooFew])

  const action = added ? 'Remove' : 'Add'
  return (
    <div className={`${CARD} p-3`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-text">{pack.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-text-faint">
            <Avatar pubkey={pack.pubkey as Hex} name={name} picture={author?.picture} size="xs" />
            <span className="truncate">by {name}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{pack.emoji.length === 1 ? '1 emoji' : `${pack.emoji.length} emoji`}</span>
          </p>
          {pack.description !== undefined ? (
            <p className="mt-1 line-clamp-2 text-[13px] text-text-muted">{pack.description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={!canEdit || busy}
          aria-label={`${action} ${pack.title}`}
          title={action}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-text transition-colors hover:bg-bg-inset disabled:cursor-not-allowed disabled:opacity-40"
        >
          {added ? (
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[15px]">
              <path fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" d="M12.8 8H3.2" />
            </svg>
          ) : (
            <PlusGlyph />
          )}
        </button>
      </div>
      {shown.length > 0 ? (
        <ul className="mt-3 flex flex-wrap items-center gap-1.5">
          {shown.map(item => (
            <li key={item.shortcode}>
              <EmojiThumb
                emoji={item}
                size="size-7"
                fallback={fallback}
                onFailed={() => setFailed(held => (held.has(item.url) ? held : new Set(held).add(item.url)))}
              />
            </li>
          ))}
          {rest > 0 ? <li className="text-[13px] text-text-faint">{`+${rest} more`}</li> : null}
        </ul>
      ) : null}
    </div>
  )
}
