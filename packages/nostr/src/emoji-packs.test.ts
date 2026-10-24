import { describe, expect, it } from 'vitest'

import { parseContent } from './content'
import {
  EMPTY_EMOJI_SELECTION,
  MAX_EMOJI_PER_PACK,
  MAX_SHORTCODE_LENGTH,
  buildEmojiPack,
  buildEmojiSelection,
  emojiIndex,
  emojiTagsFor,
  isEmojiShortcode,
  packAddress,
  parseEmojiPack,
  parseEmojiSelection,
  resolveEmojiSet,
  shortcodesIn,
  togglePack,
  type CustomEmoji,
  type EmojiPack,
} from './emoji-packs'
import type { NostrEvent } from './types'

const AUTHOR = 'a'.repeat(64)
const READER = 'b'.repeat(64)
const IMAGE = 'https://cdn.example.com/pepe.png'
const OTHER_IMAGE = 'https://cdn.example.com/other.png'

function event(kind: number, tags: string[][], overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: '0'.repeat(64),
    pubkey: AUTHOR,
    created_at: 1_783_000_000,
    kind,
    tags,
    content: '',
    sig: '0'.repeat(128),
    ...overrides,
  }
}

const pack = (tags: string[][], overrides: Partial<NostrEvent> = {}): NostrEvent =>
  event(30030, tags, overrides)
const list = (tags: string[][], overrides: Partial<NostrEvent> = {}): NostrEvent =>
  event(10030, tags, { pubkey: READER, ...overrides })

describe('isEmojiShortcode', () => {
  it('takes what NIP-30 allows and the hyphens the network actually publishes', () => {
    expect(isEmojiShortcode('pepe')).toBe(true)
    expect(isEmojiShortcode('pepe_2')).toBe(true)
    expect(isEmojiShortcode('Trust-no-one')).toBe(true)
  })

  it('refuses codes nobody could type between colons', () => {
    expect(isEmojiShortcode('me divierte')).toBe(false)
    expect(isEmojiShortcode('🤙')).toBe(false)
    expect(isEmojiShortcode('')).toBe(false)
    expect(isEmojiShortcode('a'.repeat(MAX_SHORTCODE_LENGTH + 1))).toBe(false)
  })

  it('keeps a very long shortcode', () => {
    expect(isEmojiShortcode('she-got-me-right-in-the-liver-hardest-working-liver-in-the-galaxy')).toBe(true)
  })
})

describe('parseEmojiPack', () => {
  it('reads a pack and stamps every emoji with its address', () => {
    const parsed = parseEmojiPack(
      pack([
        ['d', 'my-pack'],
        ['title', 'My pack'],
        ['description', 'Faces'],
        ['image', 'https://cdn.example.com/cover.png'],
        ['emoji', 'pepe', IMAGE],
        ['emoji', 'Trust-no-one', OTHER_IMAGE],
      ]),
    )
    expect(parsed?.title).toBe('My pack')
    expect(parsed?.untitled).toBe(false)
    expect(parsed?.emoji.map(item => item.shortcode)).toEqual(['pepe', 'Trust-no-one'])
    expect(parsed?.emoji[0]?.pack).toBe(packAddress(AUTHOR, 'my-pack'))
    expect(parsed?.address).toBe(`30030:${AUTHOR}:my-pack`)
  })

  it('falls back to the deprecated name, then to the identifier', () => {
    expect(parseEmojiPack(pack([['d', 'x'], ['name', 'Old client'], ['emoji', 'a', IMAGE]]))?.title).toBe('Old client')
    const bare = parseEmojiPack(pack([['d', 'goatmeals-pack'], ['emoji', 'a', IMAGE]]))
    expect(bare?.title).toBe('goatmeals-pack')
    expect(bare?.untitled).toBe(true)
  })

  it('reads the picture and about tags a few clients write instead', () => {
    const parsed = parseEmojiPack(
      pack([
        ['d', 'x'],
        ['picture', 'https://cdn.example.com/cover.png'],
        ['about', 'a pack'],
        ['emoji', 'a', IMAGE],
      ]),
    )
    expect(parsed?.image).toBe('https://cdn.example.com/cover.png')
    expect(parsed?.description).toBe('a pack')
  })

  it('is undefined for an empty pack', () => {
    expect(parseEmojiPack(pack([['d', 'x'], ['title', 'Nothing here']]))).toBeUndefined()
    expect(parseEmojiPack(pack([['title', 'No d tag'], ['emoji', 'a', IMAGE]]))).toBeUndefined()
    expect(parseEmojiPack(event(1, [['d', 'x'], ['emoji', 'a', IMAGE]]))).toBeUndefined()
  })

  it('drops what it cannot use and says how much', () => {
    const parsed = parseEmojiPack(
      pack([
        ['d', 'x'],
        ['emoji', 'ok', IMAGE],
        ['emoji', 'data-url', 'data:image/png;base64,AAAA'],
        ['emoji', 'me divierte', IMAGE],
        ['emoji', 'no-url'],
      ]),
    )
    expect(parsed?.emoji.map(item => item.shortcode)).toEqual(['ok'])
    expect(parsed?.dropped).toBe(3)
  })

  it('refuses an emoji on a private address, exactly as the renderer does', () => {
    const parsed = parseEmojiPack(
      pack([
        ['d', 'x'],
        ['emoji', 'lan', 'http://192.168.1.1/x.png'],
        ['emoji', 'loopback', 'http://localhost:8080/x.png'],
        ['emoji', 'ok', IMAGE],
      ]),
    )
    expect(parsed?.emoji.map(item => item.shortcode)).toEqual(['ok'])
    expect(parsed?.dropped).toBe(2)
  })

  it('keeps one row per code within a pack', () => {
    const parsed = parseEmojiPack(
      pack([['d', 'x'], ['emoji', 'pepe', IMAGE], ['emoji', 'PEPE', OTHER_IMAGE]]),
    )
    expect(parsed?.emoji).toHaveLength(1)
    expect(parsed?.emoji[0]?.url).toBe(IMAGE)
  })

  it('bounds a hostile pack', () => {
    const tags: string[][] = [['d', 'x']]
    for (let index = 0; index < MAX_EMOJI_PER_PACK + 50; index += 1) {
      tags.push(['emoji', `code_${index}`, IMAGE])
    }
    expect(parseEmojiPack(pack(tags))?.emoji).toHaveLength(MAX_EMOJI_PER_PACK)
  })
})

describe('parseEmojiSelection', () => {
  it('reads packs and loose emoji in list order', () => {
    const parsed = parseEmojiSelection(
      list([
        ['a', `30030:${AUTHOR}:one`],
        ['emoji', 'mine', IMAGE],
        ['a', `30030:${AUTHOR}:two`],
      ]),
    )
    expect(parsed.packs).toEqual([{ address: `30030:${AUTHOR}:one` }, { address: `30030:${AUTHOR}:two` }])
    expect(parsed.loose.map(item => item.shortcode)).toEqual(['mine'])
  })

  it('ignores coordinates that are not emoji packs', () => {
    const parsed = parseEmojiSelection(list([['a', `30023:${AUTHOR}:an-article`], ['a', `30030:${AUTHOR}:ok`]]))
    expect(parsed.packs).toEqual([{ address: `30030:${AUTHOR}:ok` }])
  })

  it('is empty for a missing list or the wrong kind', () => {
    expect(parseEmojiSelection(undefined)).toEqual(EMPTY_EMOJI_SELECTION)
    expect(parseEmojiSelection(event(10000, [['a', `30030:${AUTHOR}:x`]])).packs).toEqual([])
  })
})

describe('buildEmojiSelection', () => {
  it('keeps every tag it does not own, and the encrypted half', () => {
    const previous = list(
      [
        ['a', `30030:${AUTHOR}:old`],
        ['a', `30015:${AUTHOR}:interests`],
        ['alt', 'my emoji'],
        ['emoji', 'gone', IMAGE],
      ],
      { content: 'ciphertext-from-another-client' },
    )
    const template = buildEmojiSelection({
      selection: { packs: [{ address: `30030:${AUTHOR}:new` }], loose: [] },
      previous,
    })
    expect(template.tags).toContainEqual(['a', `30030:${AUTHOR}:new`])
    expect(template.tags).not.toContainEqual(['a', `30030:${AUTHOR}:old`])
    expect(template.tags).toContainEqual(['a', `30015:${AUTHOR}:interests`])
    expect(template.tags).toContainEqual(['alt', 'my emoji'])
    expect(template.content).toBe('ciphertext-from-another-client')
  })

  it('writes the relay hint into the a tag when one is known', () => {
    const template = buildEmojiSelection({
      selection: { packs: [{ address: `30030:${AUTHOR}:new`, relay: 'wss://relay.example.com' }], loose: [] },
    })
    expect(template.tags).toContainEqual(['a', `30030:${AUTHOR}:new`, 'wss://relay.example.com'])
  })

  it('KEEPS a loose emoji it could not parse', () => {
    const previous = list([
      ['emoji', 'me divierte', IMAGE],
      ['emoji', '🤙', IMAGE],
      ['emoji', 'keeper', IMAGE],
    ])
    const parsed = parseEmojiSelection(previous)
    expect(parsed.loose.map(item => item.shortcode)).toEqual(['keeper'])
    const template = buildEmojiSelection({ selection: parsed, previous })
    expect(template.tags).toContainEqual(['emoji', 'me divierte', IMAGE])
    expect(template.tags).toContainEqual(['emoji', '🤙', IMAGE])
    expect(template.tags.filter(tag => tag[0] === 'emoji' && tag[1] === 'keeper')).toHaveLength(1)
  })

  it('keeps the second of a case-insensitive pair, which only the picker deduped', () => {
    const previous = list([
      ['emoji', 'Dupe', IMAGE],
      ['emoji', 'dupe', OTHER_IMAGE],
    ])
    const template = buildEmojiSelection({ selection: parseEmojiSelection(previous), previous })
    expect(template.tags).toContainEqual(['emoji', 'Dupe', IMAGE])
    expect(template.tags).toContainEqual(['emoji', 'dupe', OTHER_IMAGE])
  })

  it('does not shorten a list longer than this app would let a reader build', () => {
    const many = Array.from({ length: 200 }, (_, index) => ['a', `30030:${AUTHOR}:pack-${index}`])
    const previous = list(many)
    const parsed = parseEmojiSelection(previous)
    expect(parsed.packs).toHaveLength(200)
    const template = buildEmojiSelection({ selection: parsed, previous })
    expect(template.tags.filter(tag => tag[0] === 'a')).toHaveLength(200)
    const added = togglePack(parsed, `30030:${AUTHOR}:new`)
    expect(added.packs).toHaveLength(201)
    expect(added.packs[0]?.address).toBe(`30030:${AUTHOR}:new`)
  })

  it('never republishes into the same second as the copy it replaces', () => {
    const previous = list([], { created_at: 1_783_000_500 })
    const template = buildEmojiSelection({
      selection: EMPTY_EMOJI_SELECTION,
      previous,
      createdAt: 1_783_000_400,
    })
    expect(template.created_at).toBe(1_783_000_501)
  })
})

describe('togglePack', () => {
  it('adds newest first and removes cleanly', () => {
    const one = togglePack(EMPTY_EMOJI_SELECTION, `30030:${AUTHOR}:one`)
    const two = togglePack(one, `30030:${AUTHOR}:two`, 'wss://relay.example.com')
    expect(two.packs).toEqual([
      { address: `30030:${AUTHOR}:two`, relay: 'wss://relay.example.com' },
      { address: `30030:${AUTHOR}:one` },
    ])
    expect(togglePack(two, `30030:${AUTHOR}:two`).packs).toEqual([{ address: `30030:${AUTHOR}:one` }])
  })
})

describe('buildEmojiPack', () => {
  it('writes three-field emoji tags and carries unknown tags forward', () => {
    const previous = pack([['d', 'x'], ['title', 'Old'], ['client', 'someone else']])
    const template = buildEmojiPack({
      identifier: 'x',
      title: 'New',
      emoji: [{ shortcode: 'pepe', url: IMAGE, pack: `30030:${AUTHOR}:x` }],
      previous,
    })
    expect(template.tags).toContainEqual(['d', 'x'])
    expect(template.tags).toContainEqual(['title', 'New'])
    expect(template.tags).toContainEqual(['name', 'New'])
    expect(template.tags).toContainEqual(['emoji', 'pepe', IMAGE])
    expect(template.tags).toContainEqual(['client', 'someone else'])
    expect(template.tags.filter(tag => tag[0] === 'title')).toHaveLength(1)
  })

  it('writes the cover under both names clients read', () => {
    const template = buildEmojiPack({
      identifier: 'x',
      title: 'p',
      image: 'https://cdn.example.com/cover.png',
      emoji: [{ shortcode: 'ok', url: IMAGE }],
    })
    expect(template.tags).toContainEqual(['image', 'https://cdn.example.com/cover.png'])
    expect(template.tags).toContainEqual(['picture', 'https://cdn.example.com/cover.png'])
  })

  it('round-trips through its own parser', () => {
    const template = buildEmojiPack({
      identifier: 'x',
      title: 'Faces',
      description: 'mine',
      emoji: [{ shortcode: 'pepe', url: IMAGE }],
    })
    const parsed = parseEmojiPack({ ...template, id: '0'.repeat(64), pubkey: AUTHOR, sig: '0'.repeat(128) })
    expect(parsed?.title).toBe('Faces')
    expect(parsed?.description).toBe('mine')
    expect(parsed?.emoji).toEqual([{ shortcode: 'pepe', url: IMAGE, pack: `30030:${AUTHOR}:x` }])
  })

  it('refuses an emoji it would not have parsed back', () => {
    const template = buildEmojiPack({
      identifier: 'x',
      title: 'p',
      emoji: [
        { shortcode: 'ok', url: IMAGE },
        { shortcode: 'not ok', url: IMAGE },
        { shortcode: 'bad-url', url: 'data:image/png;base64,AA' },
      ],
    })
    expect(template.tags.filter(tag => tag[0] === 'emoji')).toEqual([['emoji', 'ok', IMAGE]])
  })
})

describe('resolveEmojiSet', () => {
  const packs = new Map<string, EmojiPack>()
  const first = parseEmojiPack(pack([['d', 'first'], ['emoji', 'pepe', IMAGE], ['emoji', 'wave', IMAGE]]))
  const second = parseEmojiPack(pack([['d', 'second'], ['emoji', 'pepe', OTHER_IMAGE], ['emoji', 'zap', OTHER_IMAGE]]))
  if (first !== undefined) packs.set(first.address, first)
  if (second !== undefined) packs.set(second.address, second)

  it('is the reader’s own order, loose emoji first', () => {
    const resolved = resolveEmojiSet(
      {
        packs: [{ address: `30030:${AUTHOR}:second` }, { address: `30030:${AUTHOR}:first` }],
        loose: [{ shortcode: 'mine', url: IMAGE }],
      },
      packs,
    )
    expect(resolved.map(item => item.shortcode)).toEqual(['mine', 'pepe', 'zap', 'pepe_first', 'wave'])
    expect(resolved.find(item => item.shortcode === 'pepe')?.url).toBe(OTHER_IMAGE)
    const renamed = resolved.find(item => item.shortcode === 'pepe_first')
    expect(renamed?.url).toBe(IMAGE)
    expect(renamed?.renamedFrom).toBe('pepe')
  })

  it('skips a pack that has not been fetched yet', () => {
    const resolved = resolveEmojiSet({ packs: [{ address: `30030:${AUTHOR}:missing` }], loose: [] }, packs)
    expect(resolved).toEqual([])
  })
})

describe('shortcodesIn', () => {
  it('finds the codes a draft would draw', () => {
    expect(shortcodesIn('good morning :pepe: and :Trust-no-one:')).toEqual(['pepe', 'Trust-no-one'])
  })

  it('agrees with the renderer about a code inside a url', () => {
    expect(shortcodesIn('see https://example.com/a:pepe:b')).toEqual([])
    expect(parseContent('see https://example.com/a:pepe:b', [['emoji', 'pepe', IMAGE]])
      .some(segment => segment.type === 'emoji')).toBe(false)
  })

  it('ignores clock times and prose between colons', () => {
    expect(shortcodesIn('at 10:30: be there')).toEqual([])
    expect(shortcodesIn('ratio 4:3: fine')).toEqual([])
    expect(shortcodesIn('the rule :is this: never')).toEqual([])
    expect(shortcodesIn('(:pepe:)')).toEqual(['pepe'])
    expect(shortcodesIn(':pepe: first')).toEqual(['pepe'])
  })
})

describe('the renderer\u2019s own gate', () => {
  it('refuses an emoji hosted on a private address', () => {
    const lan = parseContent(':probe:', [['emoji', 'probe', 'http://192.168.1.1/a.png']])
    expect(lan.some(segment => segment.type === 'emoji')).toBe(false)
    const localhost = parseContent(':probe:', [['emoji', 'probe', 'http://localhost:8080/a.png']])
    expect(localhost.some(segment => segment.type === 'emoji')).toBe(false)
    const public_ = parseContent(':probe:', [['emoji', 'probe', IMAGE]])
    expect(public_.some(segment => segment.type === 'emoji')).toBe(true)
  })
})

describe('emojiTagsFor', () => {
  const available = emojiIndex([
    { shortcode: 'pepe', url: IMAGE },
    { shortcode: 'Ostrich', url: OTHER_IMAGE },
  ] satisfies CustomEmoji[])

  it('tags only what the reader actually has', () => {
    expect(emojiTagsFor('hi :pepe: :stranger:', available)).toEqual([['emoji', 'pepe', IMAGE]])
  })

  it('writes the code as typed so the renderer can match it', () => {
    expect(emojiTagsFor('hey :ostrich:', available)).toEqual([['emoji', 'ostrich', OTHER_IMAGE]])
    const [tag] = emojiTagsFor('hey :Ostrich:', available)
    expect(tag).toEqual(['emoji', 'Ostrich', OTHER_IMAGE])
  })

  it('declares a repeated code once', () => {
    expect(emojiTagsFor(':pepe: :pepe:', available)).toEqual([['emoji', 'pepe', IMAGE]])
  })

  it('is empty for a reader with no custom emoji', () => {
    expect(emojiTagsFor(':pepe:', new Map())).toEqual([])
  })

  it('produces tags the renderer draws', () => {
    const content = 'shipping :pepe: today'
    const segments = parseContent(content, emojiTagsFor(content, available))
    expect(segments.some(segment => segment.type === 'emoji' && segment.url === IMAGE)).toBe(true)
  })
})
