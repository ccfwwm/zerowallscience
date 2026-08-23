import { describe, expect, it } from 'vitest'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMcpEnvironmentStore, installVerifiedArchive, validateMcpEnvironmentManifest, verifyMcpEnvironmentManifest } from './mcp-environment.js'

const archive = Buffer.from('fake-mcp-environment')
const keys = generateKeyPairSync('ed25519')
const base = {
  schema: 2, environmentId: 'claude-science-mcp', version: '2026.08.22.1', platform: 'win32', architecture: 'x64',
  archiveUrl: 'https://zerowall.chengxunkeji.cn/stable/mcp-environments/windows-x64/2026.08.22.1/environment.zip', archiveSha256: createHash('sha256').update(archive).digest('hex'), archiveSize: archive.byteLength,
  python: { version: '3.12.0', relativeExecutable: 'bio-tools/python/python.exe', relativeSitePackages: 'bio-tools/python/Lib/site-packages', modules: ['mcp', 'numpy', 'pandas', 'httpx'], supportsZeroWallTool: true }, pythonHealth: { imports: ['mcp', 'numpy', 'pandas', 'httpx'], bioServer: 'bio-tools/run_server.py mcp_bio', ketcherServer: 'ketcher-chemistry/server.js' }, skillsRoot: 'skills', sci: { version: '0.3.15', nodeMinimum: '20.3.0', cli: 'sci/dist/cli.mjs', mcp: 'sci/dist/mcp.cjs' }, mcp: { bioToolsVersion: '0.0.37', ketcherChemistryVersion: '0.0.37', sciMasterVersion: '0.3.15', toolCount: 247, licenseToolCount: 14, servers: ['zerowall_managed_bio_tools', 'zerowall_managed_ketcher', 'zerowall_managed_scimaster'] }, source: { claudeScienceRuntime: '0.0.37-linux-x64', sourceHashes: {} }, signature: { algorithm: 'ed25519', keyId: 'test', value: '' },
} as const

describe('MCP environment contract', () => {
  it('validates platform, HTTPS, archive and signature fields', () => {
    const unsigned = { ...base, signature: undefined }
    const manifest = { ...base, signature: { ...base.signature, value: sign(null, Buffer.from(JSON.stringify(unsigned)), keys.privateKey).toString('base64') } }
    expect(validateMcpEnvironmentManifest(manifest).version).toBe('2026.08.22.1')
    expect(verifyMcpEnvironmentManifest(manifest, keys.publicKey)).toBe(true)
    expect(verifyMcpEnvironmentManifest({ ...manifest, version: 'tampered' }, keys.publicKey)).toBe(false)
    expect(() => validateMcpEnvironmentManifest({ ...manifest, archiveUrl: 'http://invalid' })).toThrow(/HTTPS/)
  })

  it('installs only a verified archive and cleans failed temporary output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-mcp-environment-'))
    try {
      const store = createMcpEnvironmentStore(root)
      const manifest = validateMcpEnvironmentManifest(base)
      await expect(installVerifiedArchive(store, manifest, Buffer.from('wrong'), async () => undefined)).rejects.toThrow(/hash or size/)
      await expect(installVerifiedArchive(store, manifest, archive, async (_bytes, target) => { await mkdir(join(target, 'bio-tools/python'), { recursive: true }); await writeFile(join(target, 'bio-tools/python/python.exe'), 'fake') })).resolves.toContain(manifest.version)
      expect(await readFile(join(store.versionPath(manifest.version), manifest.python.relativeExecutable), 'utf8')).toBe('fake')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
