import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { McpEnvironmentController, MCP_ENVIRONMENT_KEYRING } from '../src/main/mcp-environment.js'

const execute = promisify(execFile)
const bootstrap = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'python-base-3.12.10')
const bundledManifestPath = join(bootstrap, 'latest.json')
const bundledArchivePath = join(bootstrap, 'zerowall-python-windows-x64-3.12.10.zip')
const available = process.platform === 'win32' && existsSync(bundledManifestPath) && existsSync(bundledArchivePath)

it.skipIf(!available)('installs and reuses the real bundled Python without a migration directory', async () => {
  const selectedParent = await mkdtemp(join(tmpdir(), 'zerowall-bundled-python-'))
  const root = join(selectedParent, 'zerowall-python')
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const bundledAssets = {
    bioToolsRoot: join(workspace, 'resources', 'mcp', 'bio-tools'),
    ketcherRoot: join(workspace, 'resources', 'mcp', 'ketcher-chemistry'),
    sciRoot: join(workspace, 'mcp-environment-staging', 'sci'),
    skillsRoot: join(workspace, 'resources', 'skills'),
  }
  const controller = new McpEnvironmentController({
    root,
    bundledManifestPath,
    bundledArchivePath,
    manifestUrl: 'https://example.invalid/python/latest.json',
    publicKey: MCP_ENVIRONMENT_KEYRING['stable-1']!,
    publicKeys: MCP_ENVIRONMENT_KEYRING,
    bundledAssets,
    healthCheck: async () => {
      const { stdout, stderr } = await execute(join(selectedParent, 'Python', 'python.exe'), ['--version'])
      expect(`${stdout}${stderr}`).toContain('Python 3.12.10')
    },
    publish() {},
  })

  try {
    expect((await controller.initialize()).phase).toBe('ready')
    const interpreter = join(selectedParent, 'Python', 'python.exe')
    expect((await stat(interpreter)).isFile()).toBe(true)
    const before = await readFile(interpreter)
    const reused = await controller.initialize()
    expect(reused, JSON.stringify(reused)).toMatchObject({ phase: 'ready' })
    expect(await readFile(interpreter)).toEqual(before)
    expect((await readdir(selectedParent)).filter(name => /^Python\.(?:migrating|installing)-/u.test(name))).toEqual([])
    expect((await readdir(root)).includes('slots')).toBe(false)
  } finally {
    await rm(selectedParent, { recursive: true, force: true })
  }
}, 180_000)
