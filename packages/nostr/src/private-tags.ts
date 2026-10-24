/** Decrypted `content` to tags. */
export function parsePrivateTags(plaintext: string): string[][] | undefined {
  if (plaintext.trim() === '') return []
  try {
    const parsed: unknown = JSON.parse(plaintext)
    if (!Array.isArray(parsed)) return undefined
    return parsed.filter(
      (tag): tag is string[] => Array.isArray(tag) && tag.length > 0 && tag.every(part => typeof part === 'string'),
    )
  } catch {
    return undefined
  }
}

/** Tags to the plaintext that gets encrypted. */
export function privateTagsPlaintext(tags: readonly (readonly string[])[]): string {
  return JSON.stringify(tags)
}
