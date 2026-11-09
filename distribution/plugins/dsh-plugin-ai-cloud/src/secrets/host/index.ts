import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { AccountSecretStore } from '../../account/host/index.js'
import { desktopSecret } from './desktop.js'
/** Private DSH credential records; no dependence on the ZeroWall desktop IPC. */
export class DshSecretStore implements AccountSecretStore {
  constructor(private readonly credentials: Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>) {}
  private key(id: string) { return credentialKey('zerowall-ai-cloud', 'secret-' + Buffer.from(id).toString('hex')) }
  async get(id: string): Promise<string | undefined> {
    if (process.env.ZEROWALL_DESKTOP_SECRET_BROKER === '1') return desktopSecret('get', id)
    const record = await this.credentials.readRecord(this.key(id))
    if (record === undefined) return undefined
    if (record.kind !== 'grant' || typeof record.payload !== 'string') throw new Error('AI Cloud credential record is invalid.')
    return record.payload
  }
  async set(id: string, value: string): Promise<void> {
    if (process.env.ZEROWALL_DESKTOP_SECRET_BROKER === '1') { await desktopSecret('set', id, value); return }
    await this.credentials.modifyRecord(this.key(id), async () => ({ kind: 'grant', payload: value }))
  }
  async delete(id: string): Promise<void> {
    if (process.env.ZEROWALL_DESKTOP_SECRET_BROKER === '1') { await desktopSecret('delete', id); return }
    await this.credentials.deleteRecord(this.key(id))
  }
}

export { DshSecretStore as SecretBrokerClient }
