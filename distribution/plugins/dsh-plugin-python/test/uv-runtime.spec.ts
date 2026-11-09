import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { UvRuntime } from '../src/host/uv-runtime.js'
import { acquireRuntimeLease } from '../src/shared/runtime-leases.js'

const assets = fileURLToPath(new URL('../resources/runtime/', import.meta.url))
const basePython = process.env.DSH_TEST_PYTHON_EXECUTABLE ?? ''
const roots: string[] = []
const instances: UvRuntime[] = []
afterEach(async () => { await Promise.all(instances.splice(0).map(runtime => runtime.dispose())); vi.unstubAllEnvs(); vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture(resources = assets) {
  const environmentRoot = await mkdtemp(join(tmpdir(), 'ZeroWall 依赖新环境 ')); roots.push(environmentRoot)
  const runtime = new UvRuntime({ basePython, assetsRoot: resources, environmentRoot, uv: '', indexUrl: 'https://pypi.org/simple', timeoutMs: 120000 }); instances.push(runtime)
  return runtime
}
it('rejects a modified offline lock before executing uv or Python', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bad-python-assets-')); roots.push(root)
  await cp(join(assets, 'runtime.json'), join(root, 'runtime.json')); await writeFile(join(root, 'core.lock'), 'modified')
  const runtime = await fixture(root)
  const command = vi.spyOn(runtime, 'command')
  await expect(runtime.prepare()).rejects.toThrow('checksum mismatch')
  await expect(runtime.prepare()).rejects.toThrow('checksum mismatch')
  expect(command).not.toHaveBeenCalled(); expect(runtime.phase).toBe('failed')
})
it('rejects option and URL dependency injection', async () => {
  const runtime = await fixture()
  expect(() => runtime.install(['--system'])).toThrow('Invalid Python dependency')
  expect(() => runtime.ensureCapability('skill-test', ['name @ https://example.org/a.whl'])).toThrow('Invalid Python dependency')
})
it.skipIf(!basePython || !existsSync(basePython))('prepares offline core, isolates topics, switches generations and restores the previous environment', async () => {
  const runtime = await fixture()
  const before = createHash('sha256').update(await readFile(basePython)).digest('hex')
  const original = { ...process.env }
  for (const key of ['ZEROWALL_PYTHON_ENV_ROOT', 'ZEROWALL_PYTHON_EXECUTABLE', 'ZEROWALL_PYTHON_SITE_PACKAGES', 'VIRTUAL_ENV', Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH']) vi.stubEnv(key, process.env[key])
  const first = await runtime.prepare()
  expect(first.executable).not.toBe(basePython)
  expect(await runtime.command(first.executable, ['-I', '-B', '-c', 'import mcp,numpy,pandas,pingouin,pypdf;print("core-ready")'])).toContain('core-ready')
  await expect(runtime.resolveCapability('skill-six')).rejects.toThrow('SKILL_DEPENDENCIES_MISSING')
  const lock = await readFile(join(assets, 'core.lock'), 'utf8')
  const six = lock.split(/\r?\n(?=[A-Za-z0-9_-]+==)/u).find(row => row.startsWith('six=='))!
  const command = runtime.command.bind(runtime)
  vi.spyOn(runtime, 'command').mockImplementation((executable, args, downloads) => args[0] === 'pip' && args[1] === 'compile' ? Promise.resolve(six) : command(executable, args[0] === 'pip' && args[1] === 'install' ? [...args, '--offline'] : args, downloads))
  const topic = await runtime.ensureCapability('skill-six', ['six==1.17.0'])
  expect(topic.root).not.toBe(first.root)
  expect(await runtime.command(topic.executable, ['-I', '-B', '-c', 'import six;print(six.__version__)'])).toContain('1.17.0')
  expect(await runtime.prepare()).toEqual(first)
  const release = await acquireRuntimeLease(first.root)
  await runtime.installLocked(['requests'], lock, first.root)
  const second = await runtime.prepare()
  expect(second.root).not.toBe(first.root)
  expect(existsSync(first.executable)).toBe(true)
  expect(await runtime.command(first.executable, ['-I', '-B', '-c', 'import mcp;print("running")'])).toContain('running')
  await release()
  await expect(runtime.installLocked([], lock, first.root)).rejects.toThrow('stale')
  expect((await runtime.rollback()).root).toBe(first.root)
  expect(createHash('sha256').update(await readFile(basePython)).digest('hex')).toBe(before)
  expect(original.DSH_PYTHON_EXECUTABLE).toBe(process.env.DSH_PYTHON_EXECUTABLE)
}, 120000)
