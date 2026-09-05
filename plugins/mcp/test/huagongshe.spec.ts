import { describe, expect, it, vi } from 'vitest'
import { ZeroWallMcpService, HUAGONGSHE_URL, HUAGONGSHE_AUTH_ENV } from '../src/host/index.js'

function fixture(url = HUAGONGSHE_URL) {
  let record = { id: 'chem', serverName: 'huagongshe', url, transport: 'streamable-http', headerRefs: { Authorization: 'LEGACY_CHEM_TOKEN', 'X-Client': 'CLIENT_ID' } }
  const secrets = { get: vi.fn(), set: vi.fn(), delete: vi.fn() }
  const service = Object.create(ZeroWallMcpService.prototype)
  Object.assign(service, {
    secrets,
    exclusive: (action: () => unknown) => action(),
    projects: () => ({
      listMcpServers: () => [record],
      updateMcpServer: (_id: string, changes: object) => (record = { ...record, ...changes }),
    }),
    reconcile: vi.fn(), dto: (value: unknown) => value,
  })
  return { service: service as ZeroWallMcpService, secrets, record: () => record }
}

describe('AIchem credentials', () => {
  it('stores the token only in the vault and reconnects using an authorization reference', async () => {
    const { service, secrets, record } = fixture()
    await service.setHuagongsheApiKey('Bearer test-chem-token')
    expect(secrets.set).toHaveBeenCalledWith('zerowall.mcp.huagongshe_token', 'test-chem-token')
    expect(record().headerRefs).toEqual({ Authorization: HUAGONGSHE_AUTH_ENV, 'X-Client': 'CLIENT_ID' })
    expect(JSON.stringify(record())).not.toContain('test-chem-token')
    await service.clearHuagongsheApiKey()
    expect(record().headerRefs).toEqual({ 'X-Client': 'CLIENT_ID' })
    expect(secrets.delete).toHaveBeenCalled()
  })

  it('does not store or forward a token to a custom endpoint', async () => {
    const { service, secrets } = fixture('https://other.example/mcp')
    await expect(service.setHuagongsheApiKey('test-token')).rejects.toThrow('官方地址')
    expect(secrets.set).not.toHaveBeenCalled()
  })
})
