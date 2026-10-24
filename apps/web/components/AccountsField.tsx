'use client'

import { useRef, useState } from 'react'
import { profileDisplayName, resolveNip05, toPubkey, type Hex } from '@nostrich/nostr'

import { useProfile } from '../lib/profiles'
import { BUTTON_QUIET, INPUT_BASE } from '../lib/styles'
import { Avatar } from './Avatar'
import { MentionPicker, mentionAt, type MentionQuery } from './MentionPicker'
import { sessionPubkey, useSession } from './SessionProvider'

/** People added by @name, a pasted npub or nprofile, or a NIP-05 address, shown as chips. */
export function AccountsField({
  id,
  label,
  hint,
  authors,
  setAuthors,
  max,
  onError,
  onBusy,
  decorate,
  disabled = false,
}: {
  id: string
  label: string
  hint: string
  authors: Hex[]
  setAuthors: React.Dispatch<React.SetStateAction<Hex[]>>
  max: number
  onError: (message: string | null) => void
  /** Told while a NIP-05 address is resolving, so the dialog can hold its Save. */
  onBusy?: (busy: boolean) => void
  /** Drawn on a person's chip, for a mark such as private. */
  decorate?: (pubkey: Hex) => React.ReactNode
  disabled?: boolean
}): React.ReactNode {
  const [draft, setDraft] = useState('')
  const [busy, setBusyState] = useState(false)
  const setBusy = (next: boolean): void => {
    setBusyState(next)
    onBusy?.(next)
  }
  const { session } = useSession()
  const viewer = sessionPubkey(session)

  // A functional update, so two quick adds both land.
  const addResolved = (hex: Hex): void => {
    setAuthors(current => (current.includes(hex) ? current : [...current, hex].slice(0, max)))
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const [mention, setMention] = useState<MentionQuery | undefined>(undefined)
  const syncMention = (node: HTMLInputElement): void => {
    setMention(mentionAt(node.value, node.selectionStart ?? node.value.length))
  }

  const add = async (): Promise<void> => {
    const raw = draft.trim()
    if (raw === '') return
    try {
      const hex = toPubkey(raw)
      onError(null)
      setDraft('')
      addResolved(hex)
      return
    } catch {
      // Not a key, so it may be a NIP-05 address.
    }
    if (!raw.includes('@')) {
      onError('Paste an npub, or type a NIP-05 address like name@domain.com.')
      return
    }
    setBusy(true)
    onError(null)
    try {
      const resolved = await resolveNip05(raw)
      if (resolved === null) {
        onError(`Could not resolve ${raw}. Check the address, or paste their npub.`)
        return
      }
      setDraft('')
      addResolved(resolved.pubkey)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Field id={id} label={label} hint={hint}>
      <div className="flex gap-2">
        <span className="relative flex-1">
          <input
            id={id}
            ref={inputRef}
            value={draft}
            onChange={e => {
              setDraft(e.target.value)
              syncMention(e.currentTarget)
            }}
            onKeyUp={e => syncMention(e.currentTarget)}
            onClick={e => syncMention(e.currentTarget)}
            onBlur={() => setMention(undefined)}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              void add()
            }}
            disabled={disabled || busy || authors.length >= max}
            placeholder="@username"
            className={INPUT_BASE}
          />
          {mention !== undefined ? (
            <MentionPicker
              query={mention}
              viewer={viewer}
              field={inputRef.current}
              placement="up"
              onPick={pubkey => {
                addResolved(pubkey)
                setDraft('')
                setMention(undefined)
                onError(null)
              }}
              onDismiss={() => setMention(undefined)}
            />
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => void add()}
          disabled={disabled || busy || draft.trim() === '' || authors.length >= max}
          className={`${BUTTON_QUIET} shrink-0 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {busy ? 'Checking…' : 'Add'}
        </button>
      </div>
      {authors.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {authors.map(pubkey => (
            <AuthorChip
              key={pubkey}
              pubkey={pubkey}
              decoration={decorate?.(pubkey)}
              onRemove={disabled ? undefined : () => setAuthors(current => current.filter(a => a !== pubkey))}
            />
          ))}
        </ul>
      ) : null}
    </Field>
  )
}

/** A labelled group. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint: string
  children: React.ReactNode
}): React.ReactNode {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-text">
        {label}
      </label>
      <p className="mb-2 text-xs text-text-faint">{hint}</p>
      {children}
    </div>
  )
}

/** A person's chip, showing who it actually is. */
function AuthorChip({
  pubkey,
  onRemove,
  decoration,
}: {
  pubkey: Hex
  onRemove?: () => void
  decoration?: React.ReactNode
}): React.ReactNode {
  const profile = useProfile(pubkey)
  const name = profileDisplayName({ ...profile, pubkey })
  return (
    <li>
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg py-1 pl-2 pr-1 text-sm text-text">
        <Avatar pubkey={pubkey} name={name} picture={profile?.picture} size="sm" />
        <span className="max-w-[14rem] truncate">{name}</span>
        {decoration}
        {onRemove === undefined ? null : (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className="rounded-lg px-1 leading-none text-text-faint hover:bg-bg-inset hover:text-text"
          >
            ×
          </button>
        )}
      </span>
    </li>
  )
}
