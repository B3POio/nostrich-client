'use client'

import { useEffect, useRef, useState } from 'react'
import { FOLLOW_PACK_KIND, MAX_LIST_MEMBERS, type Hex, type ListPrivacy } from '@nostrich/nostr'

import {
  entryMembers,
  entryPrivacy,
  listErrorText,
  PeopleListError,
  privateMembersOf,
  privateUnread,
  type ListAction,
  type ListEntry,
  type PeopleListsView,
} from '../lib/people-lists'
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_QUIET, CARD, INPUT_BASE } from '../lib/styles'
import { openModal } from '../lib/modal'
import { useRevealed } from '../lib/revealed'
import { AccountsField, Field } from './AccountsField'
import { LockGlyph } from './icons'
import { Switch } from './Switch'

/** How long a signer may take before the dialog says it is waiting. */
const SLOW_MS = 3_000

/** Creates or edits one people list, its name, its people and whether they are private. */
export function ListEditor({
  api,
  entry,
  seedMembers,
  onClose,
  onCreated,
}: {
  api: PeopleListsView
  /** Undefined when creating. */
  entry?: ListEntry
  seedMembers?: Hex[]
  onClose: () => void
  onCreated?: (entry: ListEntry) => void
}): React.ReactNode {
  const ref = useRef<HTMLDialogElement>(null)
  const editing = entry !== undefined
  const address = entry?.list.address
  const isPack = entry?.list.kind === FOLLOW_PACK_KIND

  const [phase, setPhase] = useState<'ready' | 'opening' | 'shut'>(entry !== undefined && privateUnread(entry) ? 'opening' : 'ready')
  const [name, setName] = useState(entry?.list.title ?? '')
  const [members, setMembers] = useState<Hex[]>(() => (entry === undefined ? (seedMembers ?? []) : entryMembers(entry)))
  const [privacy, setPrivacy] = useState<ListPrivacy>(() =>
    entry === undefined ? (api.canEncrypt ? 'private' : 'public') : entryPrivacy(entry),
  )
  const [error, setError] = useState<string | null>(null)
  const errorLine = useRevealed<HTMLParagraphElement>(error)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [signerSlow, setSignerSlow] = useState(false)
  const inFlight = useRef<AbortController | undefined>(undefined)
  const touched = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (node === null) return
    openModal(node)
    return () => {
      if (node.open) node.close()
    }
  }, [])

  useEffect(() => {
    if (phase !== 'opening' || address === undefined) return
    let cancelled = false
    void api.show(address).then(opened => {
      if (!cancelled) setPhase(opened ? 'ready' : 'shut')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (phase !== 'ready' || entry === undefined || touched.current) return
    setMembers(entryMembers(entry))
    setPrivacy(entryPrivacy(entry))
  }, [phase, entry])

  const setMembersTouched: React.Dispatch<React.SetStateAction<Hex[]>> = value => {
    touched.current = true
    setMembers(value)
  }

  const privateBefore = entry === undefined ? new Set<Hex>() : privateMembersOf(entry)
  const before = new Set(entry === undefined ? [] : entryMembers(entry))
  const isPrivateMember = (pubkey: Hex): boolean =>
    privacy === 'private' || (privacy === 'mixed' && (privateBefore.has(pubkey) || !before.has(pubkey)))

  const switchDisabled = isPack || phase !== 'ready' || saving || (!api.canEncrypt && privacy !== 'private')
  const hint = isPack
    ? 'Follow packs are always public.'
    : phase === 'opening'
      ? 'Opening private members…'
      : phase === 'shut'
        ? 'Couldn’t open this list’s private members. Saving keeps them as they are.'
        : !api.canEncrypt && privacy === 'public'
          ? 'Your signer can’t keep people private, so this list is public.'
          : privacy === 'private'
            ? 'Only you can see who’s on this list. Its name is still public.'
            : privacy === 'mixed'
              ? 'Some people on this list are private and some are public. Turn Private on or off to make them all the same.'
              : 'Anyone can see who’s on this list.'

  const write = (action: ListAction): Promise<ListEntry | undefined> => {
    const controller = new AbortController()
    inFlight.current = controller
    let slow: ReturnType<typeof setTimeout> | undefined
    const onSigner = (waiting: boolean): void => {
      clearTimeout(slow)
      if (inFlight.current !== controller) return
      if (!waiting) setSignerSlow(false)
      else slow = setTimeout(() => inFlight.current === controller && setSignerSlow(true), SLOW_MS)
    }
    return api.run(action, { signal: controller.signal, onSigner }).finally(() => {
      clearTimeout(slow)
      if (inFlight.current === controller) inFlight.current = undefined
    })
  }

  const takeBack = (): void => {
    inFlight.current?.abort()
    inFlight.current = undefined
    setSignerSlow(false)
    setSaving(false)
    setConfirming(false)
  }

  const takenBack = (failure: unknown): boolean => failure instanceof PeopleListError && failure.code === 'cancelled'

  const save = async (): Promise<void> => {
    const title = name.trim()
    if (title === '') {
      setError('Give the list a name.')
      return
    }
    if (editing && entry !== undefined) {
      const same =
        title === (entry.list.title ?? '') &&
        privacy === entryPrivacy(entry) &&
        members.length === entryMembers(entry).length &&
        members.every(member => entryMembers(entry).includes(member))
      if (same) {
        onClose()
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      if (!editing) {
        const created = await write({ type: 'create', title, members, private: privacy === 'private' })
        if (created !== undefined) onCreated?.(created)
      } else {
        await write({ type: 'edit', address: address!, title, members, privacy })
      }
      onClose()
    } catch (failure) {
      if (takenBack(failure)) return
      setError(listErrorText(failure))
      setSaving(false)
    }
  }

  const destroy = async (): Promise<void> => {
    if (!editing) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await write({ type: 'delete', address: address! })
      onClose()
    } catch (failure) {
      if (takenBack(failure)) return
      setError(listErrorText(failure))
      setSaving(false)
    }
  }

  const heading = editing ? 'Edit list' : 'New list'

  return (
    <dialog
      tabIndex={-1}
      ref={ref}
      onClose={onClose}
      onClick={e => {
        if (e.target === ref.current) onClose()
      }}
      aria-label={heading}
      className={`${CARD} m-auto w-[min(560px,92vw)] p-0 backdrop:bg-[rgb(0_0_0/0.6)] open:animate-none`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-text">{heading}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg px-2 text-xl leading-none text-text-muted hover:bg-bg-inset hover:text-text"
        >
          ×
        </button>
      </div>

      <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
        <Field id="list-name" label="Name" hint="What the list is called. The name is public.">
          <input
            id="list-name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={Math.max(64, entry?.list.title?.length ?? 0)}
            className={INPUT_BASE}
          />
        </Field>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">Private</p>
            <p className="text-xs text-text-faint">{hint}</p>
          </div>
          <Switch
            checked={privacy === 'private'}
            label="Private"
            disabled={switchDisabled}
            onChange={next => {
              touched.current = true
              setPrivacy(next ? 'private' : 'public')
            }}
          />
        </div>

        <AccountsField
          id="list-people"
          label="People"
          hint="Type @ to find someone or paste an npub, nprofile or NIP-05 address."
          authors={members}
          setAuthors={setMembersTouched}
          max={MAX_LIST_MEMBERS}
          onError={setError}
          onBusy={setBusy}
          disabled={phase === 'opening' || saving}
          decorate={pubkey =>
            isPrivateMember(pubkey) ? (
              <span className="text-text-faint" title="Private">
                <LockGlyph />
                <span className="sr-only">Private</span>
              </span>
            ) : null
          }
        />

        {error !== null ? (
          <p ref={errorLine} role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        ) : null}
      </div>

      {confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          {signerSlow ? (
            <p role="status" className="text-sm text-text-muted">
              Waiting for your signer…
            </p>
          ) : (
            <p role="alert" className="text-sm font-medium text-danger-text">
              Delete this list? This can’t be undone.
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              autoFocus
              onClick={signerSlow ? takeBack : () => setConfirming(false)}
              disabled={saving && !signerSlow}
              className={BUTTON_QUIET}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void destroy()}
              disabled={saving}
              className={`${BUTTON_DANGER} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {saving ? 'Deleting…' : 'Delete list'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          {signerSlow ? (
            <p role="status" className="text-sm text-text-muted">
              Waiting for your signer…
            </p>
          ) : editing ? (
            <button
              type="button"
              onClick={() => void destroy()}
              disabled={saving}
              className="text-sm font-medium text-danger-text hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete list
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={signerSlow ? takeBack : onClose} className={BUTTON_QUIET}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || saving || phase === 'opening'}
              className={`${BUTTON_PRIMARY} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {saving ? 'Saving…' : editing ? 'Save' : 'Create list'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
