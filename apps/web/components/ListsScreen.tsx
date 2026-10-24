'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FOLLOW_PACK_KIND } from '@nostrich/nostr'

import { entryMembers, entryPrivacy, privateUnread, usePeopleLists, type ListEntry } from '../lib/people-lists'
import { listHref } from '../lib/links'
import { ACTION_PILL, PAGE, PAGE_TITLE } from '../lib/styles'
import { Link } from './AppLink'
import { ListEditor } from './ListEditor'
import { LockGlyph, PlusGlyph } from './icons'
import { Spinner } from './Spinner'

/** The reader's people lists, public and private, whichever app made them. */
export function ListsScreen(): React.ReactNode {
  const router = useRouter()
  const lists = usePeopleLists()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const editingEntry = editing === null ? undefined : lists.find(editing)

  return (
    <div className={PAGE}>
      <div className="flex items-start justify-between gap-[18px]">
        <h1 className={PAGE_TITLE}>Lists</h1>
        {lists.canWrite ? (
          <button type="button" onClick={() => setCreating(true)} className={ACTION_PILL}>
            <PlusGlyph />
            New list
          </button>
        ) : null}
      </div>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-text-muted">
        Create and follow custom lists of people across Nostr.
      </p>

      {!lists.ready ? (
        <Spinner label="Loading…" className="py-10" />
      ) : lists.entries.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          {lists.reachable
            ? 'You don’t have any lists yet.'
            : 'Couldn’t reach your relays. Your lists will show up when they answer.'}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {lists.entries.map(entry => (
            <ListRow
              key={entry.list.address}
              entry={entry}
              canEdit={lists.canWrite}
              onEdit={() => setEditing(entry.list.address)}
            />
          ))}
        </ul>
      )}

      {creating ? (
        <ListEditor
          api={lists}
          onClose={() => setCreating(false)}
          onCreated={created => router.push(listHref(created.list))}
        />
      ) : null}
      {editingEntry !== undefined ? (
        <ListEditor api={lists} entry={editingEntry} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  )
}

function ListRow({ entry, canEdit, onEdit }: { entry: ListEntry; canEdit: boolean; onEdit: () => void }): React.ReactNode {
  const name = entry.list.title ?? 'Untitled list'
  const privacy = entryPrivacy(entry)
  const shut = privateUnread(entry)
  const count = entryMembers(entry).length
  const pack = entry.list.kind === FOLLOW_PACK_KIND
  // A private list not opened on this device has no count to show yet.
  const detail = shut && count === 0 ? 'Private list' : count === 1 ? '1 person' : `${count} people`
  return (
    <li className="flex items-center gap-3 py-3">
      <Link href={listHref(entry.list)} className="min-w-0 flex-1 rounded-lg hover:opacity-80">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-text">{name}</span>
          {privacy !== 'public' ? (
            <span className="shrink-0 text-text-faint">
              <LockGlyph />
              <span className="sr-only">Private</span>
            </span>
          ) : null}
        </span>
        <span className="block truncate text-sm text-text-muted">
          {detail}
          {pack ? ' · Follow pack' : ''}
        </span>
      </Link>
      {canEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${name}`}
          className="shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-bg-inset hover:text-text"
        >
          <span className="material-symbols-outlined text-[20px]!" aria-hidden="true">
            tune
          </span>
        </button>
      ) : null}
    </li>
  )
}
