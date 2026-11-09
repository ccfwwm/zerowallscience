/** Desktop carrier paths are checked before plugins can prepare managed dependencies. */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { configureDesktopRuntime } from '../../desktop-host/src/runtime-environment.ts'

const roots: string[] = []
afterEach(async () => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

it('publishes the real application carrier in a path with Chinese characters and spaces', async () => {
  const root = await mkdtemp(join(tmpdir(), '桌面 runtime ')); roots.push(root)
  const entry = join(root, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs')
  await mkdir(join(entry, '..'), { recursive: true }); await writeFile(entry, '// fixture\n')
  const node = join(root, 'primary-runtime', 'dependencies', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
  await mkdir(join(node, '..'), { recursive: true }); await writeFile(node, 'fixture\n')
  for (const name of ['ZEROWALL_DESKTOP_RUNTIME_ROOT', 'ZEROWALL_DESKTOP_PNPM_ENTRY', 'DSH_DESKTOP_NODE_EXECUTABLE']) vi.stubEnv(name, '')
  configureDesktopRuntime(root, entry)
  expect(process.env.ZEROWALL_DESKTOP_RUNTIME_ROOT).toBe(root)
  expect(process.env.ZEROWALL_DESKTOP_PNPM_ENTRY).toBe(entry)
  expect(process.env.DSH_DESKTOP_NODE_EXECUTABLE).toBe(node)
})

it('rejects relative or incomplete carriers without publishing partial runtime facts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-carrier-')); roots.push(root)
  vi.stubEnv('ZEROWALL_DESKTOP_RUNTIME_ROOT', 'prior-value')
  expect(() =>{  configureDesktopRuntime('relative', join(root, 'missing')) }).toThrow('absolute')
  expect(() =>{  configureDesktopRuntime(root, join(root, 'missing')) }).toThrow()
  expect(process.env.ZEROWALL_DESKTOP_RUNTIME_ROOT).toBe('prior-value')
})
