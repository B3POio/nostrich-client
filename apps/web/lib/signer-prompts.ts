import { Nip46TimeoutError, type Signer } from '@nostrich/nostr'

/** True when this page is running inside our own app shell rather than in a browser. */
export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false
  return (window as { nostr?: { isNostrich?: boolean } }).nostr?.isNostrich === true
}

/** True when the native app's active account signs on ANOTHER device. */
export function shellSignsRemotely(): boolean {
  if (typeof window === 'undefined') return false
  return (window as { __nostrichShell?: { remote?: boolean } }).__nostrichShell?.remote === true
}

/** Can this signer be asked without the reader seeing or approving anything? */
export function asksQuietly(signer: Signer): boolean {
  if (signer.kind === 'privatekey') return true
  if (signer.kind === 'nip07') return isNativeShell() && !shellSignsRemotely()
  return false
}

/** Thrown instead of asking, once a signer has refused background work this session. */
export class BackgroundPausedError extends Error {
  constructor() {
    super('this signer refused a background request, so background requests are paused')
    this.name = 'BackgroundPausedError'
  }
}

/** Signers that refused a background request, for the life of this page. */
let refused = new WeakSet<Signer>()

/** False once this signer has refused something it was asked in the background. */
export function backgroundAllowed(signer: Signer): boolean {
  return asksQuietly(signer) || !refused.has(signer)
}

/** Ask a signer something the reader did not ask for. */
export async function askInBackground<T>(signer: Signer, ask: () => Promise<T>): Promise<T> {
  if (!backgroundAllowed(signer)) throw new BackgroundPausedError()
  try {
    return await ask()
  } catch (error) {
    if (!asksQuietly(signer) && !(error instanceof Nip46TimeoutError)) refused.add(signer)
    throw error
  }
}

/** For tests: forget every refusal. */
export function resetBackgroundRefusals(): void {
  refused = new WeakSet()
}

/** NIP-04 or NIP-44, from the ciphertext itself. */
export function isNip04Ciphertext(content: string): boolean {
  return content.includes('?iv=')
}

/** Decrypt content encrypted to the reader's own key, in whichever scheme it was written. */
export async function decryptOwn(signer: Signer, pubkey: string, content: string): Promise<string> {
  if (!isNip04Ciphertext(content)) return signer.nip44Decrypt(pubkey, content)
  if (signer.nip04Decrypt === undefined) throw new Error('this signer cannot read NIP-04')
  return signer.nip04Decrypt(pubkey, content)
}
