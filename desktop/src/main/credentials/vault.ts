import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'

export interface CredentialEncryption {
  encrypt(value: string): Buffer
  decrypt(value: Buffer): string
}

interface CredentialDocument {
  version: 1
  entries: Record<string, string>
}

export const CREDENTIAL_KEY = /^zerowall\.(?:ai-cloud|environment|mcp|ssh|wechat)\.[a-z0-9][a-z0-9._-]{0,127}$/

export function assertCredentialKey(key: string): void {
  if (!CREDENTIAL_KEY.test(key)) throw new Error('Credential key is outside the ZeroWall namespace.')
}

export class CredentialVault {
  private document?: CredentialDocument
  private writeTail = Promise.resolve()

  constructor(
    private readonly path: string,
    private readonly encryption: CredentialEncryption,
  ) {}

  async get(key: string): Promise<string | undefined> {
    assertCredentialKey(key)
    const encoded = (await this.load()).entries[key]
    if (encoded === undefined) return undefined
    try {
      return this.encryption.decrypt(Buffer.from(encoded, 'base64'))
    } catch {
      // OS credential encryption can become unavailable after a Windows
      // profile change. The ciphertext is unrecoverable, but unrelated
      // credentials must remain usable.
      await this.mutate((document) => { delete document.entries[key] })
      return undefined
    }
  }

  async set(key: string, value: string): Promise<void> {
    assertCredentialKey(key)
    if (value.length === 0) throw new Error('Credential value must not be empty.')
    await this.mutate((document) => {
      document.entries[key] = this.encryption.encrypt(value).toString('base64')
    })
  }

  async delete(key: string): Promise<void> {
    assertCredentialKey(key)
    await this.mutate((document) => { delete document.entries[key] })
  }

  private async mutate(change: (document: CredentialDocument) => void): Promise<void> {
    const operation = this.writeTail.then(async () => {
      const document = await this.load()
      change(document)
      await this.persist(document)
    })
    this.writeTail = operation.catch(() => undefined)
    await operation
  }

  private async load(): Promise<CredentialDocument> {
    if (this.document !== undefined) return this.document
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<CredentialDocument>
      if (parsed.version !== 1 || parsed.entries === undefined || Array.isArray(parsed.entries)) {
        throw new Error('Unsupported credential vault format.')
      }
      for (const [key, encoded] of Object.entries(parsed.entries)) {
        assertCredentialKey(key)
        if (typeof encoded !== 'string' || encoded.length === 0) throw new Error('Invalid encrypted credential entry.')
      }
      this.document = { version: 1, entries: { ...parsed.entries } }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.document = { version: 1, entries: {} }
    }
    return this.document
  }

  private async persist(document: CredentialDocument): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(document)}\n`, { encoding: 'utf8', flag: 'wx' })
      await rename(temporary, this.path)
    } finally {
      await rm(temporary, { force: true })
    }
  }
}
