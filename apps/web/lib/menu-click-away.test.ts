import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMenuClickAway } from './dismiss'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Menu({ open, onClose }: { open: () => boolean; onClose: () => void }): React.ReactNode {
  const menu = useRef<HTMLDivElement>(null)
  useMenuClickAway(open, [menu], onClose)
  return createElement(
    'div',
    null,
    createElement('div', { ref: menu }, createElement('button', { type: 'button', id: 'row' }, 'Copy link')),
    createElement('a', { href: '/e/note', id: 'note' }, 'A note'),
  )
}

// Stands in for the listener that opens a note in place.
const opener = vi.fn()
const onNote = (event: MouseEvent): void => {
  if ((event.target as HTMLElement).closest('#note') !== null) {
    event.preventDefault()
    opener()
  }
}

let root: Root | undefined
let host: HTMLElement | undefined

async function mount(open: () => boolean, onClose: () => void): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root?.render(createElement(Menu, { open, onClose })))
  return host
}

function press(node: Element | null): void {
  node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

afterEach(async () => {
  document.removeEventListener('click', onNote, true)
  opener.mockClear()
  await act(async () => root?.unmount())
  host?.remove()
})

describe('an open menu and a click outside it', () => {
  it('closes the menu and opens nothing under it', async () => {
    document.addEventListener('click', onNote, true)
    const onClose = vi.fn()
    const node = await mount(() => true, onClose)
    press(node.querySelector('#note'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(opener).not.toHaveBeenCalled()
  })

  it('leaves a click on the menu to the menu', async () => {
    const onClose = vi.fn()
    const node = await mount(() => true, onClose)
    press(node.querySelector('#row'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('lets every click through while the menu is closed', async () => {
    document.addEventListener('click', onNote, true)
    const onClose = vi.fn()
    const node = await mount(() => false, onClose)
    press(node.querySelector('#note'))
    expect(onClose).not.toHaveBeenCalled()
    expect(opener).toHaveBeenCalledTimes(1)
  })
})
