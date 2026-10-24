import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { CustomEmoji } from '@nostrich/nostr'

import { EmojiThumb, __resetEmojiFailuresForTest } from '../components/EmojiThumb'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** What a dead emoji looks like, which is the reason this component exists. */

const alive: CustomEmoji = { shortcode: 'alive', url: 'https://cdn.example.com/a.png' }
const dead: CustomEmoji = { shortcode: 'dead_one', url: 'https://gone.example.com/b.png' }

const roots: Root[] = []

async function mount(props: Parameters<typeof EmojiThumb>[0]): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  await act(async () => root.render(createElement(EmojiThumb, props)))
  return host
}

async function fail(host: HTMLElement): Promise<void> {
  const image = host.querySelector('img')
  if (image === null) throw new Error('no image to fail')
  await act(async () => {
    image.dispatchEvent(new Event('error'))
  })
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount())
  document.body.innerHTML = ''
  __resetEmojiFailuresForTest()
})

describe('EmojiThumb', () => {
  it('draws the picture, lazily and without a referrer', async () => {
    const host = await mount({ emoji: alive, size: 'size-7' })
    const image = host.querySelector('img')
    expect(image?.getAttribute('src')).toBe(alive.url)
    expect(image?.getAttribute('alt')).toBe(':alive:')
    expect(image?.getAttribute('loading')).toBe('lazy')
    expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('draws the shortcode when the host is gone, never a broken image', async () => {
    const host = await mount({ emoji: dead, size: 'size-7' })
    await fail(host)
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toContain('dead_one')
  })

  it('tells the shelf once, so a pack of dead emoji can be dropped', async () => {
    const told: string[] = []
    const host = await mount({ emoji: dead, size: 'size-7', onFailed: item => told.push(item.shortcode) })
    await fail(host)
    expect(told).toEqual(['dead_one'])
  })

  it('does not ask a host that already failed in this document, and still reports it', async () => {
    await fail(await mount({ emoji: dead, size: 'size-7' }))
    const told: string[] = []
    const second = await mount({ emoji: dead, size: 'size-5', onFailed: item => told.push(item.shortcode) })
    expect(second.querySelector('img')).toBeNull()
    expect(told).toEqual(['dead_one'])
  })

  it('draws nothing for a dead emoji where a card asked for no stand-in', async () => {
    const host = await mount({ emoji: dead, size: 'size-7', fallback: 'none' })
    await fail(host)
    expect(host.innerHTML).toBe('')
  })

  it('keeps one dead host from spoiling another emoji', async () => {
    await fail(await mount({ emoji: dead, size: 'size-7' }))
    const second = await mount({ emoji: alive, size: 'size-7' })
    expect(second.querySelector('img')?.getAttribute('src')).toBe(alive.url)
  })
})
