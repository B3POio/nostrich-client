import { describe, expect, it } from 'vitest'

import { MORE_LINKS, inMoreSection, moreHref, moreLinks } from '../components/more-links'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('the More menu', () => {
  it('holds Articles, Lists, Downloads and Settings, in that order, with Settings last', () => {
    expect(moreLinks().map(link => link.href)).toEqual(['/articles', '/lists', '/downloads', '/settings'])
  })

  it('leaves Settings out where the drawer draws it as a row of its own', () => {
    expect(moreLinks(true).map(link => link.href)).not.toContain('/settings')
  })

  it('shares no row with the main menu', () => {
    const rail = readFileSync(join(__dirname, '../components/LeftRail.tsx'), 'utf8')
    const main = rail.slice(rail.indexOf('export const NAV_ITEMS'), rail.indexOf(']', rail.indexOf('export const NAV_ITEMS')))
    for (const link of MORE_LINKS) expect(main).not.toContain(`href: '${link.href}'`)
  })

  it('lights for a page under one of its rows', () => {
    expect(inMoreSection('/articles/new')).toBe(true)
    expect(inMoreSection('/notifications')).toBe(false)
  })

  it('sends a guest to sign in only for a row that needs a key', () => {
    expect(moreHref({ href: '/x', label: 'X', icon: 'x', auth: true }, false)).toBe('/login')
    expect(moreHref({ href: '/downloads', label: 'Downloads', icon: 'download' }, false)).toBe('/downloads')
  })
})
