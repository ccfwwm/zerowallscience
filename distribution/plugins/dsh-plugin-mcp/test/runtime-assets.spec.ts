/** Real bundled Node MCP handshakes without a Python installation or remote calls. */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ManagedGenerations } from '../src/host/managed-generations.js'
import { resolveMcpConfig } from '../src/host/index.js'
import type { McpServerRecord } from '@zerowall/research-store'
import { PACKAGE_ROOT } from '../src/root.js'

afterEach(() => vi.unstubAllEnvs())

it.each([
  ['zerowall_managed_ketcher', 'zerowall-managed:ketcher'],
  ['zerowall_managed_scimaster', 'zerowall-managed:scimaster'],
])('starts the packaged %s server independently of Python', async (serverName, command) => {
  for (const key of ['ZEROWALL_PYTHON_ENV_ROOT', 'ZEROWALL_PYTHON_EXECUTABLE', 'ZEROWALL_PYTHON_SITE_PACKAGES']) vi.stubEnv(key, '')
  const record: McpServerRecord = { id: serverName, name: serverName, serverName, command,
    transport: 'stdio', enabled: true, args: [], cwd: '', envRefs: {}, headerRefs: {}, url: '',
    failOnStartupError: true, toolCallTimeoutMs: 5000,
    reconnect: { enabled: false, initialDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 0 }, createdAt: '', updatedAt: '' }
  const config = resolveMcpConfig(record, {}).config
  if (!config || config.transport !== 'stdio') throw new Error('Expected a local MCP launch')
  if (command === 'zerowall-managed:scimaster') config.env.ZEROWALL_SCIMASTER_API_KEY = 'handshake-only-placeholder'
  const generations = new ManagedGenerations({ tools: {} } as never)
  try {
    const prepared = await generations.prepare(config)
    expect(prepared.definitions.size).toBeGreaterThan(0)
    await generations.discard(prepared)
  } finally { await generations.dispose() }
})

it('ships the official SciMaster server bytes with its license', async () => {
  const upstream = dirname(createRequire(import.meta.url).resolve('scimaster-cli/package.json'))
  expect(await readFile(join(PACKAGE_ROOT, 'resources/sci/dist/mcp.cjs'))).toEqual(await readFile(join(upstream, 'dist/mcp.cjs')))
  expect(await readFile(join(PACKAGE_ROOT, 'resources/sci/LICENSE'))).toEqual(await readFile(join(upstream, 'LICENSE')))
})

it.skipIf(!process.env.ZEROWALL_TEST_PYTHON_ENV_ROOT)('starts the Bio aggregate in a prepared dependency environment', async () => {
  for (const key of ['ENV_ROOT', 'EXECUTABLE', 'SITE_PACKAGES']) {
    const value = process.env[`ZEROWALL_TEST_PYTHON_${key}`]
    if (!value) throw new Error(`Missing ZEROWALL_TEST_PYTHON_${key}`)
    vi.stubEnv(`ZEROWALL_PYTHON_${key}`, value)
  }
  const record: McpServerRecord = { id: 'bio', name: 'Bio', serverName: 'zerowall_managed_bio_tools', command: 'zerowall-managed:bio-tools',
    transport: 'stdio', enabled: true, args: [], cwd: '', envRefs: {}, headerRefs: {}, url: '',
    failOnStartupError: true, toolCallTimeoutMs: 10000,
    reconnect: { enabled: false, initialDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 0 }, createdAt: '', updatedAt: '' }
  const config = resolveMcpConfig(record, process.env).config
  if (!config || config.transport !== 'stdio') throw new Error('Expected a Python MCP launch')
  const generations = new ManagedGenerations({ tools: {} } as never)
  try {
    const prepared = await generations.prepare(config)
    expect(prepared.definitions.size).toBe(8)
    await generations.discard(prepared)
  } finally { await generations.dispose() }
}, 30000)
