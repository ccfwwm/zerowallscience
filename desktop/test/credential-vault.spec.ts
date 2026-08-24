import { EventEmitter } from 'node:events'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { attachCredentialBroker } from '../src/main/credentials/broker.js'
import { CredentialVault } from '../src/main/credentials/vault.js'

const encryption = {
  encrypt: (value: string) => Buffer.from(`encrypted:${Buffer.from(value).toString('base64')}`),
  decrypt: (value: Buffer) => Buffer.from(value.toString().slice('encrypted:'.length), 'base64').toString(),
}

describe('Electron credential vault', () => {
  it('persists only encrypted values and serializes updates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-vault-'))
    const path = join(root, 'credentials', 'vault.json')
    const vault = new CredentialVault(path, encryption)
    await Promise.all([
      vault.set('zerowall.ai-cloud.session', 'session-secret'),
      vault.set('zerowall.ai-cloud.login', 'account-password'),
      vault.set('zerowall.ai-cloud.group.2', 'group-secret'),
      vault.set('zerowall.mcp.scimaster_api_key', 'scimaster-secret'),
      vault.set('zerowall.wechat.ilink', 'wechat-token'),
    ])
    expect(await vault.get('zerowall.ai-cloud.session')).toBe('session-secret')
    expect(await vault.get('zerowall.wechat.ilink')).toBe('wechat-token')
    expect(await vault.get('zerowall.mcp.scimaster_api_key')).toBe('scimaster-secret')
    const raw = await readFile(path, 'utf8')
    expect(raw).not.toContain('session-secret')
    expect(raw).not.toContain('account-password')
    expect(raw).not.toContain('group-secret')
    await vault.delete('zerowall.ai-cloud.session')
    expect(await vault.get('zerowall.ai-cloud.session')).toBeUndefined()
  })

  it('serves only namespaced operations over child-process IPC', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-broker-'))
    const vault = new CredentialVault(join(root, 'vault.json'), encryption)
    const child = new EventEmitter() as ChildProcess
    const replies: unknown[] = []
    Object.assign(child, { connected: true, send: (message: unknown) => { replies.push(message); return true } })
    const detach = attachCredentialBroker(child, vault)
    child.emit('message', {
      kind: 'zerowall-secret-request', requestId: 'set-1', operation: 'set',
      key: 'zerowall.ai-cloud.session', value: 'secret',
    })
    await expect.poll(() => replies.length).toBe(1)
    child.emit('message', {
      kind: 'zerowall-secret-request', requestId: 'bad-1', operation: 'get', key: 'outside.secret',
    })
    await expect.poll(() => replies.length).toBe(2)
    expect(replies[1]).toMatchObject({ requestId: 'bad-1', ok: false })
    detach()
  })

  it('removes one undecryptable credential without losing the remaining vault', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-vault-'))
    const path = join(root, 'credentials', 'vault.json')
    const vault = new CredentialVault(path, {
      encrypt: encryption.encrypt,
      decrypt: (value) => {
        if (value.toString() === 'broken') throw new Error('safeStorage decrypt failed')
        return encryption.decrypt(value)
      },
    })
    await vault.set('zerowall.ai-cloud.session', 'session-secret')
    await vault.set('zerowall.wechat.ilink', 'wechat-secret')
    const document = JSON.parse(await readFile(path, 'utf8')) as { entries: Record<string, string> }
    document.entries['zerowall.wechat.ilink'] = Buffer.from('broken').toString('base64')
    await (await import('node:fs/promises')).writeFile(path, `${JSON.stringify(document)}\n`)

    const restored = new CredentialVault(path, {
      encrypt: encryption.encrypt,
      decrypt: (value) => {
        if (value.toString() === 'broken') throw new Error('safeStorage decrypt failed')
        return encryption.decrypt(value)
      },
    })
    await expect(restored.get('zerowall.wechat.ilink')).resolves.toBeUndefined()
    await expect(restored.get('zerowall.ai-cloud.session')).resolves.toBe('session-secret')
    const repaired = JSON.parse(await readFile(path, 'utf8')) as { entries: Record<string, string> }
    expect(repaired.entries['zerowall.wechat.ilink']).toBeUndefined()
  })
})
