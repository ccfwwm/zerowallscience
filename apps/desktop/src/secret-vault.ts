/** Encrypted ZeroWall secrets owned by Electron, accessed only over its private Host IPC. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ChildProcess } from 'node:child_process'

/** OS-backed encryption; plaintext is never persisted. */
export interface SecretEncryption {
  encrypt(value: string): Buffer
  decrypt(value: Buffer): string
}

/** Secret ids accepted by the desktop broker. */
export const SECRET_ID = /^zerowall\.(?:ai-cloud|environment|mcp|ssh|wechat)\.[a-z0-9][a-z0-9._-]{0,127}$/u

/** Validate a disk vault without including its contents in error messages. */
export function parseSecretVault(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1
    || !('entries' in value) || typeof value.entries !== 'object' || value.entries === null || Array.isArray(value.entries)) {
    throw new Error('Unsupported encrypted credential vault')
  }
  const entries = Object.create(null) as Record<string, string>
  const values = value.entries as Record<string, unknown>
  for (const [key, encoded] of Object.entries(values)) {
    if (!SECRET_ID.test(key) || typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
      throw new Error('Invalid encrypted credential entry')
    }
    entries[key] = encoded
  }
  return entries
}

/** Serialized, atomic encrypted storage. Failed decryptions keep ciphertext and reject the read. */
export class DesktopSecretVault {
  private tail: Promise<void> = Promise.resolve()
  /** @param path - Private destination file. @param encryption - Current-user OS encryption. */
  constructor(private readonly path: string, private readonly encryption: SecretEncryption) {}

  private async entries(): Promise<Record<string, string>> {
    let text: string
    try { text = await readFile(this.path, 'utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error }
    let value: unknown
    try { value = JSON.parse(text) } catch (_error) { throw new Error('Unreadable encrypted credential vault') }
    return parseSecretVault(value)
  }

  /** @param id - ZeroWall secret id. @returns Decrypted value, or absence; rejects when locked. */
  async get(id: string): Promise<string | undefined> {
    if (!SECRET_ID.test(id)) throw new Error('Invalid secret id')
    await this.tail
    const encoded = (await this.entries())[id]
    if (encoded === undefined) return undefined
    try { return this.encryption.decrypt(Buffer.from(encoded, 'base64')) }
    catch (_error) { throw new Error('Saved credentials could not be unlocked for this Windows user') }
  }

  /** @param id - ZeroWall secret id. @param value - Secret, or undefined to delete. @returns Durable completion. */
  set(id: string, value: string | undefined): Promise<void> {
    return this.setMany({ [id]: value })
  }

  /** @param values - Secrets committed together, with undefined deleting a value. @returns Atomic durable completion. */
  setMany(values: Readonly<Record<string, string | undefined>>): Promise<void> {
    if (Object.keys(values).some(id => !SECRET_ID.test(id))) return Promise.reject(new Error('Invalid secret id'))
    const operation = this.tail.then(async () => {
      const entries = await this.entries()
      for (const [id, value] of Object.entries(values)) {
        if (value === undefined) Reflect.deleteProperty(entries, id)
        else entries[id] = this.encryption.encrypt(value).toString('base64')
      }
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      const temporary = `${this.path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, JSON.stringify({ version: 1, entries }) + '\n', { flag: 'wx', mode: 0o600 })
        await rename(temporary, this.path)
      } finally { await rm(temporary, { force: true }) }
    })
    this.tail = operation.catch((_error: unknown) => {
      /* The caller receives this failed mutation; later independent reads remain possible. */
    })
    return operation
  }
}

/**
 * Answer only validated secret requests from the owned child. Values never enter diagnostics.
 * @param child - Owned Node Host IPC channel.
 * @param vault - Main-process encrypted store.
 * @param message - Untrusted process message.
 * @returns Whether the broker consumed this message.
 */
export function handleSecretRequest(child: ChildProcess, vault: DesktopSecretVault, message: unknown): boolean {
  if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== 'zerowall-secret') return false
  if (!('requestId' in message) || typeof message.requestId !== 'string' || message.requestId.length > 64
    || !('id' in message) || typeof message.id !== 'string' || !SECRET_ID.test(message.id)
    || !('action' in message) || !['get', 'set', 'delete'].includes(String(message.action))) return true
  const { id, requestId } = message
  const reply = (result: object): void => { if (child.connected) child.send({ type: 'zerowall-secret-result',
    requestId,
    ...result },
  () => {}) }
  void (async () => {
    try {
      if (message.action === 'get') reply({ ok: true, value: await vault.get(id) })
      else {
        if (message.action === 'set' && (!('value' in message) || typeof message.value !== 'string' || message.value.length > 1024 * 1024)) throw new Error('Invalid secret value')
        await vault.set(id,
          message.action === 'delete' ? undefined : 'value' in message && typeof message.value === 'string' ? message.value : undefined)
        reply({ ok: true })
      }
    } catch (_error) { reply({ ok: false,
      error: 'Encrypted credential operation failed; sign in again or repair the desktop credential store' }) }
  })()
  return true
}
