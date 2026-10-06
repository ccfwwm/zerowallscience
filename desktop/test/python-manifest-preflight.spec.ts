import { afterEach, expect, it, vi } from 'vitest'

const resolver = vi.hoisted(() => ({ calls: [] as Array<{ args: string[]; env?: NodeJS.ProcessEnv }>, failFirst: false }))

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { EventEmitter } = await import('node:events')
  const { writeFile } = await import('node:fs/promises')
  return {
    ...actual,
    spawn: vi.fn((command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => {
      resolver.calls.push({ args, env: options.env })
      const child = new EventEmitter() as any
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = () => undefined
      queueMicrotask(async () => {
        const bootstrap = args[3] ?? ''
        const encodedArgv = /sys\.argv=(\[[^\n]+\])\nrunpy/u.exec(bootstrap)?.[1]
        if (!encodedArgv) { child.stderr.emit('data', Buffer.from('pip bootstrap arguments missing')); child.emit('exit', 1); return }
        const pipArgs = JSON.parse(encodedArgv) as string[]
        if (resolver.failFirst && resolver.calls.length === 1) {
          child.stderr.emit('data', Buffer.from('ERROR: No matching distribution found for brainglobe==3.0.0\n'))
          child.emit('exit', 1)
          return
        }
        const reportPath = pipArgs[pipArgs.indexOf('--report') + 1]
        await writeFile(reportPath!, JSON.stringify({ install: [{
          metadata: { name: 'brainglobe', version: '3.0.0' },
          download_info: { url: 'https://files.pythonhosted.org/packages/brainglobe-3.0.0-py3-none-any.whl', archive_info: { hashes: { sha256: 'a'.repeat(64) } } },
        }] }))
        child.stdout.emit('data', Buffer.from('Collecting brainglobe==3.0.0\n'))
        child.emit('exit', 0)
      })
      return child
    }),
  }
})

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareManifestPackagePlan } from '../src/main/python-packages.js'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  resolver.calls.length = 0
  resolver.failFirst = false
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it('checks signed pins as binary-only direct requirements, falls back to PyPI, and reports progress', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-manifest-preflight-'))
  roots.push(root)
  vi.stubEnv('PIP_NO_BINARY', 'brainglobe')
  resolver.failFirst = true
  const manifest = {
    schema: 3 as const, runtimeId: 'zerowall-science-python' as const, platform: 'win32-x64' as const,
    pythonVersion: '3.12.10', environmentVersion: '3.12.10', revision: 'r14',
    layer: 'science' as const, createdAt: new Date().toISOString(),
    index: { indexUrl: 'https://mirrors.ustc.edu.cn/pypi/simple' },
    compatibility: { minApplicationVersion: '8.0.5' },
    signature: { algorithm: 'ed25519' as const, keyId: 'fixture', value: 'fixture' },
    packages: [{ name: 'brainglobe', version: '3.0.0', required: true, capabilities: ['science'] }],
  }
  const progress: Array<{ stage: string; progress?: number; completedPackages?: number; totalPackages?: number }> = []
  const plan = await prepareManifestPackagePlan(root, {
    root,
    executable: join(root, 'python.exe'),
    sitePackages: join(root, 'site-packages'),
    manifest: {} as never,
    mirror: { indexUrl: manifest.index.indexUrl },
  }, manifest, { ready: true, packages: [] } as never, value => { progress.push(value) })

  expect(plan.error).toBeUndefined()
  expect(plan.wheels).toEqual([expect.objectContaining({ name: 'brainglobe', version: '3.0.0', url: expect.stringContaining('files.pythonhosted.org') })])
  expect(resolver.calls).toHaveLength(2)
  const bootstraps = resolver.calls.map(call => call.args[3] ?? '')
  expect(bootstraps.every(value => value.includes('"--no-deps"') && value.includes('"--only-binary=:all:"'))).toBe(true)
  expect(bootstraps.every(value => value.includes('"--timeout","15"') && value.includes('"--retries","1"'))).toBe(true)
  expect(resolver.calls.every(call => call.env?.PIP_NO_BINARY === undefined)).toBe(true)
  expect(progress.some(value => value.stage === 'mirror-fallback')).toBe(true)
  expect(progress.at(-1)).toMatchObject({ stage: 'preflight-complete', progress: 99, completedPackages: 1, totalPackages: 1 })
})
