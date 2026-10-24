import { describe, expect, it } from 'vitest'

import { collectDeletions, emptyDeletions, isDeletedBy, isTombstone, newestLiveVersions, recordDeletion } from './deletions'
import type { NostrEvent } from './types'

const AUTHOR = 'ab'.repeat(32)
const STRANGER = 'a'.repeat(64)
const ADDRESS = `30023:${AUTHOR}:taco-season`

function event(fields: Partial<NostrEvent>): NostrEvent {
  return { id: '0'.repeat(64), pubkey: AUTHOR, created_at: 0, kind: 30023, tags: [], content: '', sig: '0'.repeat(128), ...fields }
}

const RECIPE = event({
  id: '1'.repeat(64),
  created_at: 1_781_386_361,
  tags: [['d', 'taco-season'], ['title', 'TACO SEASON'], ['client', 'Example App']],
  content: "## Chef's notes\n\nThis a mild-heat garlic and onion-free blend…",
})
const TOMBSTONE = event({
  id: '2'.repeat(64),
  created_at: 1_790_441_760,
  tags: [['d', 'taco-season'], ['deleted', 'true'], ['title', '[Deleted]']],
})
const DELETION = event({
  id: 'e840aa12994c'.padEnd(64, '0'),
  kind: 5,
  created_at: 1_790_441_763,
  content: 'Recipe deleted by author',
  tags: [['e', RECIPE.id], ['a', ADDRESS], ['k', '30023']],
})

describe('isTombstone', () => {
  it('is a `deleted` tag on an addressable event, with or without a value', () => {
    expect(isTombstone(TOMBSTONE)).toBe(true)
    expect(isTombstone(event({ tags: [['deleted'], ['d', 'an-old-piece']] }))).toBe(true)
    expect(isTombstone(event({ tags: [['deleted', 'false'], ['d', 'x']] }))).toBe(false)
    expect(isTombstone(RECIPE)).toBe(false)
    expect(isTombstone(event({ kind: 1, tags: [['deleted', 'true']] }))).toBe(false)
  })
})

describe('newestLiveVersions', () => {
  it('drops the article when the relays hand back the recipe and the kind 5 but no blank revision', () => {
    expect(newestLiveVersions([RECIPE, DELETION])).toEqual([])
  })

  it('drops the article when the newest version is the blank revision, never falling back to the recipe', () => {
    expect(newestLiveVersions([RECIPE, TOMBSTONE])).toEqual([])
    expect(newestLiveVersions([TOMBSTONE])).toEqual([])
  })

  it('reads an address deletion even when the kind 5 names no id', () => {
    const byAddress = event({ ...DELETION, tags: [['a', ADDRESS]] })
    expect(newestLiveVersions([RECIPE, byAddress])).toEqual([])
  })

  it('shows a piece published again under the same `d` after the deletion', () => {
    const again = event({ id: '7'.repeat(64), created_at: DELETION.created_at + 60, tags: [['d', 'taco-season'], ['title', 'TACO SEASON II']] })
    expect(newestLiveVersions([RECIPE, TOMBSTONE, DELETION, again])).toEqual([again])
  })

  it('ignores a deletion somebody else signed, by id or by address', () => {
    const forged = event({ ...DELETION, pubkey: STRANGER })
    expect(newestLiveVersions([RECIPE, forged])).toEqual([RECIPE])
    const own = event({ ...DELETION, pubkey: STRANGER, tags: [['a', `30023:${STRANGER}:taco-season`]] })
    expect(newestLiveVersions([RECIPE, own])).toEqual([RECIPE])
  })

  it('keeps the newest version and the lower id on a tie, and leaves other articles alone', () => {
    const edit = event({ id: '9'.repeat(64), created_at: RECIPE.created_at + 10, tags: [['d', 'taco-season'], ['title', 'high']] })
    const tie = event({ id: '2'.repeat(64), created_at: RECIPE.created_at + 10, tags: [['d', 'taco-season'], ['title', 'low']] })
    const other = event({ id: '3'.repeat(64), tags: [['d', 'chili'], ['title', 'CHILI']] })
    expect(newestLiveVersions([RECIPE, edit, tie, other, DELETION]).map(e => e.id)).toEqual([other.id])
    expect(newestLiveVersions([RECIPE, edit, tie, other])).toEqual([tie, other])
  })

  it('takes deletions the caller already heard of', () => {
    expect(newestLiveVersions([RECIPE], collectDeletions([DELETION]))).toEqual([])
  })
})

describe('recordDeletion and isDeletedBy', () => {
  it('refuses a copy that arrives after its deletion, as a feed meets them', () => {
    const heard = emptyDeletions()
    expect(recordDeletion(heard, TOMBSTONE)).toBe(true)
    expect(isDeletedBy(RECIPE, heard)).toBe(true)
    expect(isDeletedBy(TOMBSTONE, heard)).toBe(true)
    expect(recordDeletion(heard, RECIPE)).toBe(false)
  })

  it('removes a note by id only for its own author', () => {
    const note = event({ id: '4'.repeat(64), kind: 1 })
    const heard = collectDeletions([event({ kind: 5, pubkey: STRANGER, tags: [['e', note.id]] })])
    expect(isDeletedBy(note, heard)).toBe(false)
    recordDeletion(heard, event({ kind: 5, tags: [['e', note.id]] }))
    expect(isDeletedBy(note, heard)).toBe(true)
  })
})
