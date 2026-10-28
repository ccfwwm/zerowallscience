import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpServerRecord } from '@zerowallscience/research-store'
import { aiCloudCredentialKey, hasEnvironmentCredential, managedBioDependenciesReady, managedEnvironmentFileSignature, managedEnvironmentRecord, providerCredentialNames, redactError, resolveMcpConfig, resolveStdioLaunch, sanitizeMcpToolSchema } from '../src/host/index.js'
beforeEach(() => { vi.stubEnv('ZEROWALL_PYTHON_RUNTIME_ROOT', ''); vi.stubEnv('ZEROWALL_PYTHON_MANAGEMENT_ROOT', '') })
afterEach(() => vi.unstubAllEnvs())

const base: McpServerRecord = {
  id: 'mcp-1', name: 'Tools', serverName: 'tools', transport: 'stdio', enabled: true,
  command: 'node', args: ['server.mjs'], cwd: 'C:/science', envRefs: { API_TOKEN: 'MCP_TOKEN' },
  url: '', headerRefs: {}, toolCallTimeoutMs: 60000, failOnStartupError: true,
  reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 },
  createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z',
}

describe('ZeroWall MCP config boundary', () => {
  it('recognizes official environment credentials stored in the shared vault', async () => {
    const vault = new Map([['zerowall.environment.var.zerowall_scimaster_api_key', 'remote-secret']])
    expect(await hasEnvironmentCredential('ZEROWALL_SCIMASTER_API_KEY', async key => vault.get(key), {})).toBe(true)
    expect(await hasEnvironmentCredential('HUAGONGSHE_MCP_AUTHORIZATION', async () => undefined, { HUAGONGSHE_MCP_AUTHORIZATION: 'Bearer env-secret' })).toBe(true)
    expect(await hasEnvironmentCredential('R_PLATFORM_MCP_AUTHORIZATION', async () => ' ', {})).toBe(false)
    expect(await hasEnvironmentCredential('NCBI_API_KEY', async () => { throw new Error('vault unavailable') }, {})).toBe(false)
  })
  it('keeps useful tool schema fields and bounds oversized or deeply nested values', () => {
    const normal = sanitizeMcpToolSchema({ type: 'object', properties: { query: { type: 'string', description: 'Search term' } }, required: ['query'] })
    expect(normal.truncated).toBe(false)
    expect(normal.schema).toMatchObject({ properties: { query: { type: 'string', description: 'Search term' } }, required: ['query'] })

    let deep: unknown = 'end'
    for (let index = 0; index < 15; index++) deep = { nested: deep }
    const bounded = sanitizeMcpToolSchema({ deep, large: 'x'.repeat(60_000), unsafe: { constructor: 'hidden', safe: true } })
    expect(bounded.truncated).toBe(true)
    expect(JSON.stringify(bounded.schema).length).toBeLessThan(52_000)
    expect(JSON.stringify(bounded.schema)).not.toContain('hidden')
    expect(JSON.stringify(bounded.schema)).toContain('[truncated]')
  })
  it('enforces the final 48 KB UTF-8 JSON limit after Unicode and escaping', () => {
    const escaped = sanitizeMcpToolSchema({
      type: 'object',
      description: `${'\n"\\'.repeat(8_000)}${'🧬'.repeat(8_000)}${'测'.repeat(8_000)}`,
      properties: Object.fromEntries(Array.from({ length: 200 }, (_, index) => [
        `变量-${index}-${'\n'.repeat(100)}`,
        { type: 'string', description: '🧬"\\'.repeat(500) },
      ])),
    })
    expect(escaped.truncated).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(escaped.schema), 'utf8')).toBeLessThanOrEqual(48_000)

    const multibyte = sanitizeMcpToolSchema({ examples: Array.from({ length: 100 }, () => '🧬'.repeat(4_096)) })
    expect(multibyte.truncated).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(multibyte.schema), 'utf8')).toBeLessThanOrEqual(48_000)
  })
  it('returns JSON-safe schema values across the Remote boundary', () => {
    const projected = sanitizeMcpToolSchema({
      type: 'object',
      optional: undefined,
      callback: () => 'unsupported',
      infinite: Number.POSITIVE_INFINITY,
      examples: [undefined, Symbol('unsupported'), 1n, Number.NaN, null, 2],
    })
    expect(projected.truncated).toBe(true)
    expect(projected.schema).toEqual({ type: 'object', examples: [null, null, null, null, null, 2] })
    expect(JSON.parse(JSON.stringify(projected.schema))).toEqual(projected.schema)
  })
  it('keeps the transport error and final Python exception in long redacted diagnostics', () => {
    const diagnostic = redactError(new Error('closed\nMCP stderr: ' + '  traceback frame token=secret-value\n'.repeat(250) + 'ImportError: missing required package'))
    expect(diagnostic.startsWith('closed')).toBe(true)
    expect(diagnostic.endsWith('ImportError: missing required package')).toBe(true)
    expect(diagnostic).not.toContain('secret-value')
    expect(diagnostic.length).toBeLessThanOrEqual(4000)
  })
  it('uses the explicit Host projection for active and candidate Python without a second Python directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'zws-python-projection-'))
    const previous = { python: process.env.ZEROWALL_PYTHON_ROOT, bio: process.env.ZEROWALL_BIO_TOOLS_ROOT }
    const manager = join(root, '.zerowall'), bio = join(root, 'bio-tools')
    mkdirSync(manager); mkdirSync(bio); writeFileSync(join(root, "python.exe"), "")
    const candidate = { root, runtimeRoot: root, health: 'ready', version: '3.12.10', runtimeLayout: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' }, manifest: { python: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages', bootstrapOnly: true } } }
    writeFileSync(join(manager, 'current.json'), JSON.stringify(candidate))
    process.env.ZEROWALL_PYTHON_ROOT = manager; process.env.ZEROWALL_BIO_TOOLS_ROOT = bio
    const record = { ...base, command: 'zerowall-managed:bio-tools', args: [], envRefs: {} }
    try {
      for (const state of [undefined, candidate]) {
        expect(resolveMcpConfig(record, {}, root, undefined, state).config).toMatchObject({ command: join(root, 'python.exe'), env: { PYTHONPATH: join(root, 'Lib', 'site-packages') } })
      }
      expect(managedBioDependenciesReady(candidate, true)).toBe(false)
      mkdirSync(join(root, 'Lib/site-packages/mcp'), { recursive: true })
      writeFileSync(join(root, 'Lib/site-packages/mcp/__init__.py'), '')
      expect(managedBioDependenciesReady(candidate, true)).toBe(true)
      expect(managedBioDependenciesReady({ ...candidate, runtimeLayout: undefined }, true)).toBe(true)
      expect(() => resolveMcpConfig(record, {}, root, undefined, { ...candidate, manifest: { python: { relativeExecutable: 'python.exe', relativeSitePackages: '../site-packages' } } })).toThrow('shared Python package layout')
    } finally {
      if (previous.python === undefined) delete process.env.ZEROWALL_PYTHON_ROOT; else process.env.ZEROWALL_PYTHON_ROOT = previous.python
      if (previous.bio === undefined) delete process.env.ZEROWALL_BIO_TOOLS_ROOT; else process.env.ZEROWALL_BIO_TOOLS_ROOT = previous.bio
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('resolves stdio credential references only inside the Host', () => {
    const result = resolveMcpConfig(base, { MCP_TOKEN: 'secret-value' })
    expect(result.missingEnvironmentVariables).toEqual([])
    expect(result.config).toMatchObject({ transport: 'stdio', env: { API_TOKEN: 'secret-value' } })
  })

  it('rejects old slots for every product-owned launch command', () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-python-slot-reject-'))
    const previous = process.env.ZEROWALL_PYTHON_RUNTIME_ROOT
    process.env.ZEROWALL_PYTHON_RUNTIME_ROOT = root
    const candidate = { root: join(root, '.zerowall/slots/a-old'), generation: true, health: 'ready' }
    try {
      for (const command of ['zerowall-managed:bio-tools', 'zerowall-managed:ketcher', 'zerowall-managed:scimaster']) {
        expect(() => resolveMcpConfig({ ...base, command, args: [], envRefs: {} }, {}, root, undefined, candidate)).toThrow('PYTHON_FIXED_PATH_REQUIRED')
      }
    } finally {
      if (previous === undefined) delete process.env.ZEROWALL_PYTHON_RUNTIME_ROOT; else process.env.ZEROWALL_PYTHON_RUNTIME_ROOT = previous
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('preflights a canonical single-directory candidate manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-python-canonical-candidate-'))
    const previous = {
      bio: process.env.ZEROWALL_BIO_TOOLS_ROOT,
      python: process.env.ZEROWALL_PYTHON_ROOT,
    }
    const candidateRoot = join(root, 'Python')
    const candidate = {
      root: candidateRoot,
      runtimeRoot: candidateRoot,
      health: 'ready',
      environmentVersion: '3.12.10',
      manifest: { python: { relativeExecutable: 'python.exe', relativeSitePackages: 'Lib/site-packages' } },
    }
    const bio = join(root, 'bio-tools')
    mkdirSync(candidateRoot, { recursive: true })
    mkdirSync(bio, { recursive: true })
    writeFileSync(join(candidateRoot, 'python.exe'), '')
    process.env.ZEROWALL_BIO_TOOLS_ROOT = bio
    process.env.ZEROWALL_PYTHON_ROOT = join(candidateRoot, '.zerowall')
    try {
      const config = resolveMcpConfig({ ...base, serverName: 'zerowall_managed_bio_tools', command: 'zerowall-managed:bio-tools', args: [], envRefs: {} }, {}, root, undefined, candidate).config
      expect(config).toMatchObject({
        command: join(candidateRoot, 'python.exe'),
        args: [join(bio, 'run_server.py'), 'mcp_bio'],
        cwd: bio,
        env: { PYTHONPATH: join(candidateRoot, 'Lib', 'site-packages') },
      })
    } finally {
      for (const [name, value] of [['ZEROWALL_BIO_TOOLS_ROOT', previous.bio], ['ZEROWALL_PYTHON_ROOT', previous.python]] as const) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('normalizes stdio working directories and path arguments to absolute paths', () => {
    const result = resolveStdioLaunch({ command: 'node', args: ['scripts/server.mjs', '@scope/server', '--flag'], cwd: 'workspace' }, 'C:/host')
    expect(result.cwd).toMatch(/^[A-Za-z]:[\\/]host[\\/]workspace$/u)
    expect(result.command).toBe('node')
    expect(result.args[0]).toMatch(/^[A-Za-z]:[\\/]host[\\/]workspace[\\/]scripts[\\/]server\.mjs$/u)
    expect(result.args.slice(1)).toEqual(['@scope/server', '--flag'])
  })

  it('returns only missing environment variable names', () => {
    const result = resolveMcpConfig(base, {})
    expect(result).toEqual({ missingEnvironmentVariables: ['MCP_TOKEN'] })
    expect(JSON.stringify(result)).not.toContain('API_TOKEN=')
  })

  it('resolves HTTP headers from environment references', () => {
    const result = resolveMcpConfig({
      ...base,
      transport: 'streamable-http', command: '', args: [], envRefs: {}, url: 'https://mcp.example.test/api',
      headerRefs: { Authorization: 'MCP_AUTHORIZATION' },
    }, { MCP_AUTHORIZATION: 'Bearer secret-value' })
    expect(result.config).toMatchObject({
      transport: 'streamable-http',
      url: 'https://mcp.example.test/api',
      headers: { Authorization: 'Bearer secret-value' },
    })
  })

  it('ignores references owned by the inactive transport', () => {
    const stdio = resolveMcpConfig({ ...base, headerRefs: { Authorization: 'MISSING_HTTP_TOKEN' } }, { MCP_TOKEN: 'value' })
    expect(stdio.missingEnvironmentVariables).toEqual([])

    const http = resolveMcpConfig({
      ...base,
      transport: 'streamable-http', command: '', args: [], url: 'https://mcp.example.test/api',
      headerRefs: {}, envRefs: { API_TOKEN: 'MISSING_STDIO_TOKEN' },
    }, {})
    expect(http.missingEnvironmentVariables).toEqual([])
  })

  it('redacts credentials and URL query values from runtime errors', () => {
    const redacted = redactError(new Error(
      'Bearer abc.def token=plain https://user:pass@mcp.example.test/api?api_key=query-secret#fragment',
    ))
    expect(redacted).not.toContain('abc.def')
    expect(redacted).not.toContain('plain')
    expect(redacted).not.toContain('user')
    expect(redacted).not.toContain('pass')
    expect(redacted).not.toContain('query-secret')
    expect(redacted).toContain('[redacted]')
  })

  it('maps only supported AI Cloud provider routes to group secret keys', () => {
    expect(aiCloudCredentialKey('zerowall-ai-cloud-50-completions')).toBe('zerowall.ai-cloud.group.50')
    expect(aiCloudCredentialKey('zerowall-ai-cloud-50-responses')).toBe('zerowall.ai-cloud.group.50')
    expect(aiCloudCredentialKey('zerowall-ai-cloud-50-messages')).toBe('zerowall.ai-cloud.group.50')
    expect(aiCloudCredentialKey('zerowall-ai-cloud-0-completions')).toBeUndefined()
    expect(aiCloudCredentialKey('other-provider-50')).toBeUndefined()
  })

  it('maps official and custom providers to host credential references', () => {
    expect(providerCredentialNames('deepseek-official')).toContain('DEEPSEEK_API_KEY')
    expect(providerCredentialNames('openai-custom')).toContain('OPENAI_API_KEY')
    expect(providerCredentialNames('my-lab-gateway')).toContain('MY_LAB_GATEWAY_API_KEY')
    expect(providerCredentialNames('deepseek-official')).toContain('LLM_API_KEY')
  })

  it('caches the large managed environment record until current.json changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-environment-cache-'))
    const prior = process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
    const manager = join(root, '.zerowall'); mkdirSync(manager); writeFileSync(join(root, 'python.exe'), '')
    process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = manager
    try {
      writeFileSync(join(manager, 'current.json'), JSON.stringify({ root, runtimeRoot: root, health: 'ready', environmentVersion: '1.0.0' }))
      const firstSignature = managedEnvironmentFileSignature()
      const first = managedEnvironmentRecord(firstSignature)
      expect(managedEnvironmentRecord(firstSignature)).toBe(first)

      writeFileSync(join(manager, 'current.json'), JSON.stringify({ root, runtimeRoot: root, health: 'ready', environmentVersion: '1.0.0', contentRevision: 2 }))
      const secondSignature = managedEnvironmentFileSignature()
      expect(secondSignature).not.toBe(firstSignature)
      expect(managedEnvironmentRecord(secondSignature)).not.toBe(first)
      expect(managedEnvironmentRecord(secondSignature)?.contentRevision).toBe(2)
    } finally {
      if (prior === undefined) delete process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
      else process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = prior
      rmSync(root, { recursive: true, force: true })
    }
  })
})
