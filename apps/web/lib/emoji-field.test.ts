import { describe, expect, it } from 'vitest'
import type { CustomEmoji } from '@nostrich/nostr'

import { shortcodeAt, suggestEmoji } from './emoji-field'

/** When the colon panel opens, which is the whole risk in this typing gesture. */

const IMAGE = 'https://cdn.example.com/a.png'

describe('shortcodeAt', () => {
  it('opens on a colon word at a boundary', () => {
    expect(shortcodeAt(':pe', 3)).toEqual({ term: 'pe', start: 0, end: 3 })
    expect(shortcodeAt('hey :pe', 7)).toEqual({ term: 'pe', start: 4, end: 7 })
    expect(shortcodeAt('(:pe', 4)).toEqual({ term: 'pe', start: 1, end: 4 })
  })

  it('stays shut on a bare colon', () => {
    expect(shortcodeAt('so:', 3)).toBeUndefined()
  })

  it('stays shut inside a word, a time or a url', () => {
    expect(shortcodeAt('10:30', 5)).toBeUndefined()
    expect(shortcodeAt('https://exa', 11)).toBeUndefined()
    expect(shortcodeAt('ratio 4:3', 9)).toBeUndefined()
  })

  it('takes hyphens, which 7% of real shortcodes have', () => {
    expect(shortcodeAt('a :Trust-no', 11)?.term).toBe('Trust-no')
  })

  it('ends at the caret, not at the end of the line', () => {
    expect(shortcodeAt(':pepe: and more', 3)).toEqual({ term: 'pe', start: 0, end: 3 })
  })
})

describe('the emoticon rule', () => {
  it('stays shut for :D, :P and :3', () => {
    expect(shortcodeAt('nice :D', 7)).toBeUndefined()
    expect(shortcodeAt('nice :P', 7)).toBeUndefined()
    expect(shortcodeAt('nice :3', 7)).toBeUndefined()
    expect(shortcodeAt('nice :de', 8)?.term).toBe('de')
  })
})

describe('suggestEmoji', () => {
  const emoji: CustomEmoji[] = [
    { shortcode: 'jalapeno_pepper', url: IMAGE },
    { shortcode: 'pepe', url: IMAGE },
    { shortcode: 'pepe_sad', url: IMAGE },
  ]

  it('puts a prefix match above a substring, then the shorter one', () => {
    expect(suggestEmoji(emoji, 'pep').map(item => item.shortcode)).toEqual([
      'pepe',
      'pepe_sad',
      'jalapeno_pepper',
    ])
  })

  it('matches without case, because the reader is typing', () => {
    expect(suggestEmoji(emoji, 'PEP')[0]?.shortcode).toBe('pepe')
  })

  it('answers nothing for an empty term or no matches', () => {
    expect(suggestEmoji(emoji, '')).toEqual([])
    expect(suggestEmoji(emoji, 'zzz')).toEqual([])
  })
})

describe('shortcodeAt in other scripts', () => {
  it('opens on a word in any script, marks included', () => {
    expect(shortcodeAt('hey :kurbağa', 12)?.term).toBe('kurbağa')
    expect(shortcodeAt(':カエル', 4)?.term).toBe('カエル')
    expect(shortcodeAt(':मेंढक', 6)?.term).toBe('मेंढक')
    expect(shortcodeAt(':กบ', 3)?.term).toBe('กบ')
  })

  it('still ignores a colon after a letter of any script, and a one-letter emoticon', () => {
    expect(shortcodeAt('düğün:ab', 8)).toBeUndefined()
    expect(shortcodeAt('Москва:ab', 9)).toBeUndefined()
    expect(shortcodeAt('nice :D', 7)).toBeUndefined()
    expect(shortcodeAt('ok :ş', 5)).toBeUndefined()
  })
})
