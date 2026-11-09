import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { UvRuntime, type RuntimeConfig } from '../src/host/uv-runtime.js'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename) }
})

const roots: string[] = []
const instances: UvRuntime[] = []
const releases: (() => void)[] = []
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const lock = 'six==1.17.0 --hash=sha256:' + 'a'.repeat(64) + '\n'

beforeEach(() => {
  for (const key of ['PATH', 'Path', 'VIRTUAL_ENV', 'ZEROWALL_PYTHON_ENV_ROOT', 'ZEROWALL_PYTHON_EXECUTABLE', 'ZEROWALL_PYTHON_SITE_PACKAGES', 'PYTHONHOME', 'PYTHONPATH', 'CONDA_PREFIX', 'CONDA_DEFAULT_ENV', 'ZEROWALL_PYTHON_ROOT', 'ZEROWALL_PYTHON_RUNTIME_ROOT', 'ZEROWALL_PYTHON_MANAGEMENT_ROOT', 'ZEROWALL_MCP_ENVIRONMENT_ROOT']) vi.stubEnv(key, process.env[key])
})
afterEach(async () => {
  for (const release of releases.splice(0)) release()
  await Promise.all(instances.splice(0).map(runtime => runtime.dispose()))
  vi.restoreAllMocks(); vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function barrier() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); releases.push(release); return { promise, release } }

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'python-transaction-')); roots.push(root)
  const assetsRoot = join(root, 'assets'); await mkdir(assetsRoot)
  await writeFile(join(assetsRoot, 'core.lock'), lock); await writeFile(join(assetsRoot, 'core.in'), 'six==1.17.0\n')
  await writeFile(join(assetsRoot, 'runtime.json'), JSON.stringify({ schema: 1, pythonVersion: '3.12.14', platform: process.platform, arch: process.arch, uv: 'uv', uvVersion: '0.13.7', uvSha256: 'unused', requirements: 'core.lock', wheels: 'wheels', revision: digest(lock), imports: ['six'], files: [] }))
  const config: RuntimeConfig = { basePython: join(root, 'carrier-python'), assetsRoot, environmentRoot: join(root, 'dependencies'), uv: 'fixture-uv', indexUrl: 'https://pypi.org/simple', timeoutMs: 20000 }
  let installFailure = false
  let installGate: ReturnType<typeof barrier> | undefined
  let installEntered: ReturnType<typeof barrier> | undefined
  const runtime = new UvRuntime(config); instances.push(runtime)
  const command = vi.spyOn(runtime, 'command').mockImplementation(async (executable, args) => {
    if (args[0] === '--version') return 'uv 0.13.7\n'
    if (args.includes('import platform;print(platform.python_version())')) return '3.12.14\n'
    if (args[0] === 'venv') {
      const directory = args.at(-1)!
      await mkdir(join(directory, process.platform === 'win32' ? 'Scripts' : 'bin'), { recursive: true })
      await mkdir(join(directory, 'site-packages'))
      await writeFile(join(directory, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'), 'fixture interpreter')
      return ''
    }
    if (args.some(value => value.includes('sysconfig.get_path'))) return JSON.stringify(join(dirname(dirname(executable)), 'site-packages'))
    if (args[0] === 'pip' && args[1] === 'compile') return lock
    if (args[0] === 'pip' && args[1] === 'install') {
      installEntered?.release(); await installGate?.promise
      if (installFailure) throw new Error('Fixture dependency installation failed.')
    }
    return ''
  })
  return { root, config, runtime, command, fail: (value: boolean) => { installFailure = value }, pause: () => { installGate = barrier(); installEntered = barrier(); return { entered: installEntered.promise, release: installGate.release } } }
}

async function declareWheel(f: Awaited<ReturnType<typeof fixture>>, directory?: string) {
  const filename = 'six-1.17.0-py2.py3-none-any.whl'; const body = 'fixture locked wheel'
  const manifest = join(f.config.assetsRoot, 'runtime.json')
  const payload = JSON.parse(await readFile(manifest, 'utf8'))
  payload.files = [{ filename, sha256: digest(body), bytes: Buffer.byteLength(body) }]
  await writeFile(manifest, JSON.stringify(payload))
  if (directory) { await mkdir(directory, { recursive: true }); await writeFile(join(directory, filename), body) }
  return { filename, body }
}

it('uses an explicit absolute verified wheelhouse for offline core without changing the carrier interpreter', async () => {
  const f = await fixture(); const wheelhouse = join(f.root, 'carrier wheelhouse 科研')
  await declareWheel(f, wheelhouse); f.config.wheelhouse = wheelhouse
  await writeFile(f.config.basePython, 'immutable carrier interpreter')
  const result = await f.runtime.prepare()
  const calls = f.command.mock.calls.filter(([, args]) => args[0] === 'pip' && args[1] === 'install')
  expect(calls).toHaveLength(1)
  expect(calls[0]![1]).toEqual(expect.arrayContaining(['--require-hashes', '--only-binary', ':all:', '--offline', '--no-index', '--find-links', wheelhouse]))
  expect(calls[0]![1]).not.toContain('--default-index')
  expect(await readFile(join(result.root, 'requirements.lock'), 'utf8')).toBe(lock)
  expect(await readFile(f.config.basePython, 'utf8')).toBe('immutable carrier interpreter')
  expect(f.command.mock.calls.some(([, args]) => args[0] === 'pip' && args[1] === 'compile')).toBe(false)
})

it('downloads the same hash-locked core from the configured index when npm omits the default wheelhouse', async () => {
  const f = await fixture(); await declareWheel(f)
  const result = await f.runtime.prepare()
  const args = f.command.mock.calls.find(([, args]) => args[0] === 'pip' && args[1] === 'install')![1]
  expect(args).toEqual(expect.arrayContaining(['--require-hashes', '--only-binary', ':all:', '--default-index', f.config.indexUrl]))
  expect(args).not.toContain('--offline'); expect(args).not.toContain('--no-index'); expect(args).not.toContain('--find-links')
  expect(await readFile(join(result.root, 'requirements.lock'), 'utf8')).toBe(lock)
  expect(f.command.mock.calls.some(([, args]) => args[0] === 'pip' && args[1] === 'compile')).toBe(false)
})

it('uses an explicitly configured verified wheel directory offline', async () => {
  const f = await fixture(); const directory = join(f.config.assetsRoot, 'wheels'); await declareWheel(f, directory)
  f.config.wheelhouse = directory
  await f.runtime.prepare()
  const args = f.command.mock.calls.find(([, args]) => args[0] === 'pip' && args[1] === 'install')![1]
  expect(args).toEqual(expect.arrayContaining(['--offline', '--no-index', '--find-links', directory]))
  expect(args).not.toContain('--default-index')
})

it.each(['relative', 'missing', 'missing-file', 'checksum', 'bytes'])('fails a %s explicit wheelhouse before executing uv instead of using the index', async kind => {
  const f = await fixture(); const directory = join(f.root, 'explicit-wheels')
  const declared = await declareWheel(f, kind === 'missing' ? undefined : directory)
  f.config.wheelhouse = kind === 'relative' ? 'relative-wheels' : directory
  if (kind === 'missing-file') await rm(join(directory, declared.filename))
  if (kind === 'checksum') await writeFile(join(directory, declared.filename), declared.body.replace('locked', 'broken'))
  if (kind === 'bytes') await writeFile(join(directory, declared.filename), declared.body + 'extra')
  await expect(f.runtime.prepare()).rejects.toThrow()
  expect(f.command).not.toHaveBeenCalled()
  expect(f.runtime.phase).toBe('failed')
  await expect(readFile(join(f.config.environmentRoot, 'active.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('retains the committed generation and cleans staging when an addition fails', async () => {
  const f = await fixture(); const first = await f.runtime.prepare()
  const receipt = await readFile(join(f.config.environmentRoot, 'active.json'), 'utf8')
  f.fail(true)
  await expect(f.runtime.install(['requests'])).rejects.toThrow('Fixture dependency')
  expect(await readFile(join(f.config.environmentRoot, 'active.json'), 'utf8')).toBe(receipt)
  expect(await readdir(join(f.config.environmentRoot, 'environments'))).toEqual([JSON.parse(receipt).directory])
  expect(await f.runtime.prepare()).toEqual(first)
  expect(f.runtime.phase).toBe('ready')
  expect(process.env.ZEROWALL_PYTHON_ENV_ROOT).toBe(first.root)
})

it('keeps the shared environment ready while an optional topic prepares', async () => {
  const f = await fixture(); const first = await f.runtime.prepare()
  const gate = f.pause(); const installing = f.runtime.ensureCapability('skill-topic', ['requests'])
  await gate.entered
  expect(f.runtime.phase).toBe('ready')
  expect(await f.runtime.prepare()).toEqual(first)
  gate.release(); const topic = await installing
  expect(topic.root).not.toBe(first.root)
  expect(f.runtime.phase).toBe('ready')
  expect(await f.runtime.resolveCapability('skill-topic')).toEqual(topic)
})

it('keeps active unchanged when receipt persistence fails', async () => {
  const f = await fixture(); const first = await f.runtime.prepare()
  const receipt = await readFile(join(f.config.environmentRoot, 'active.json'), 'utf8')
  await mkdir(join(f.config.environmentRoot, 'previous.json'))
  await expect(f.runtime.install(['requests'])).rejects.toThrow()
  expect(await readFile(join(f.config.environmentRoot, 'active.json'), 'utf8')).toBe(receipt)
  expect(await f.runtime.prepare()).toEqual(first)
  expect(await readdir(join(f.config.environmentRoot, 'environments'))).toEqual([JSON.parse(receipt).directory])
})

it('keeps both pointers and the published generation intact when rollback cannot commit', async () => {
  const f = await fixture(); const first = await f.runtime.prepare(); await f.runtime.install(['requests'])
  const second = await f.runtime.prepare()
  const active = join(f.config.environmentRoot, 'active.json'); const previous = join(f.config.environmentRoot, 'previous.json')
  const activeBefore = await readFile(active, 'utf8'); const previousBefore = await readFile(previous, 'utf8')
  vi.mocked(rename).mockRejectedValueOnce(new Error('Fixture receipt commit failed.'))
  await expect(f.runtime.rollback()).rejects.toThrow('Fixture receipt commit')
  expect(await readFile(active, 'utf8')).toBe(activeBefore)
  expect(await readFile(previous, 'utf8')).toBe(previousBefore)
  expect(await f.runtime.prepare()).toEqual(second)
  expect(process.env.ZEROWALL_PYTHON_ENV_ROOT).toBe(second.root)
  expect(await f.runtime.rollback()).toEqual(first)
  expect(await f.runtime.rollback()).toEqual(first)
  expect(await readFile(previous, 'utf8')).toBe(previousBefore)
  await f.runtime.install(['httpx'])
  expect(JSON.parse(await readFile(previous, 'utf8')).directory).toBe(JSON.parse(previousBefore).directory)
})

it('keeps a failed initial attempt failed until an explicit retry', async () => {
  const f = await fixture(); f.fail(true)
  await expect(f.runtime.prepare()).rejects.toThrow('Fixture dependency')
  const calls = f.command.mock.calls.length
  f.fail(false)
  await expect(f.runtime.prepare()).rejects.toThrow('Fixture dependency')
  await expect(f.runtime.resolveCapability('skill-test')).rejects.toThrow('Fixture dependency')
  expect(f.command.mock.calls).toHaveLength(calls)
  expect((await f.runtime.retry()).root).toContain('environments')
  expect(f.runtime.phase).toBe('ready')
})

it('resolves capabilities without starting preparation or installing a missing topic', async () => {
  const f = await fixture()
  await expect(f.runtime.resolveCapability('skill-core')).rejects.toThrow('SKILL_DEPENDENCIES_MISSING')
  expect(f.command).not.toHaveBeenCalled()
  await f.runtime.prepare(); f.command.mockClear()
  await expect(f.runtime.resolveCapability('skill-test')).rejects.toThrow('SKILL_DEPENDENCIES_MISSING')
  expect(f.command).not.toHaveBeenCalled()
})

it('rejects a second writer while the first holds its transaction and preserves both additions on retry', async () => {
  const f = await fixture(); await f.runtime.prepare()
  const second = new UvRuntime(f.config); instances.push(second)
  vi.spyOn(second, 'command').mockImplementation(f.runtime.command)
  await second.prepare()
  const gate = f.pause(); const installing = f.runtime.install(['requests']); await gate.entered
  await expect(second.install(['httpx'])).rejects.toThrow('another Host')
  gate.release(); await installing
  await second.install(['httpx'])
  const saved = JSON.parse(await readFile(join(f.config.environmentRoot, 'active.json'), 'utf8'))
  expect(saved.requirements).toEqual(['requests', 'httpx'])
})

it('reclaims a dead writer once without allowing concurrent stale-lock cleanup to remove a new owner', async () => {
  const f = await fixture(); await f.runtime.prepare()
  const second = new UvRuntime(f.config); instances.push(second)
  vi.spyOn(second, 'command').mockImplementation(f.runtime.command); await second.prepare()
  await writeFile(join(f.config.environmentRoot, 'writer.lock'), JSON.stringify({ pid: 2147483000 }))
  const kill = process.kill.bind(process)
  vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    if (pid === 2147483000) throw Object.assign(new Error('Fixture owner is gone.'), { code: 'ESRCH' })
    return kill(pid, signal)
  })
  const gate = f.pause()
  const settled = Promise.allSettled([f.runtime.install(['requests']), second.install(['httpx'])])
  await gate.entered
  expect(JSON.parse(await readFile(join(f.config.environmentRoot, 'writer.lock'), 'utf8')).pid).toBe(process.pid)
  gate.release()
  const results = await settled
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(row => row.status === 'rejected')).toHaveLength(1)
  const firstFailed = results[0]!.status === 'rejected'
  await (firstFailed ? f.runtime.install(['requests']) : second.install(['httpx']))
  const saved = JSON.parse(await readFile(join(f.config.environmentRoot, 'active.json'), 'utf8'))
  expect(saved.requirements.sort()).toEqual(['httpx', 'requests'])
})

it('cancels a staging transaction before pointer publication and refuses new work after disposal', async () => {
  const f = await fixture(); const first = await f.runtime.prepare()
  const receipt = await readFile(join(f.config.environmentRoot, 'active.json'), 'utf8')
  const gate = f.pause(); const installing = f.runtime.install(['requests']); const settled = expect(installing).rejects.toThrow()
  await gate.entered
  const disposing = f.runtime.dispose(); gate.release()
  await Promise.all([settled, disposing])
  expect(await readFile(join(f.config.environmentRoot, 'active.json'), 'utf8')).toBe(receipt)
  expect(process.env.ZEROWALL_PYTHON_ENV_ROOT).toBe(first.root)
  await expect(f.runtime.prepare()).rejects.toThrow('cancelled')
  expect(await readdir(join(f.config.environmentRoot, 'environments'))).toEqual([JSON.parse(receipt).directory])
})

it.each(['isolated', 'checksum', 'directory'])('rejects a changed %s receipt without installing a replacement', async kind => {
  const f = await fixture(); await f.runtime.prepare()
  const file = join(f.config.environmentRoot, 'active.json'); const saved = JSON.parse(await readFile(file, 'utf8'))
  if (kind === 'isolated') saved.isolated = true
  if (kind === 'checksum') saved.lockSha256 = 'b'.repeat(64)
  if (kind === 'directory') saved.directory = '../outside'
  await writeFile(file, JSON.stringify(saved))
  const second = new UvRuntime(f.config); instances.push(second)
  const command = vi.spyOn(second, 'command').mockImplementation(f.runtime.command)
  await expect(second.prepare()).rejects.toThrow()
  expect(command.mock.calls.some(([, args]) => args[0] === 'venv')).toBe(false)
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(saved)
})

it('rejects an environment directory redirected outside the dependency store', async () => {
  const f = await fixture(); await f.runtime.prepare()
  const file = join(f.config.environmentRoot, 'active.json'); const saved = JSON.parse(await readFile(file, 'utf8'))
  const directory = join(f.config.environmentRoot, 'environments', saved.directory)
  const outside = join(f.root, 'outside'); await mkdir(outside)
  await rm(directory, { recursive: true }); await symlink(outside, directory, process.platform === 'win32' ? 'junction' : 'dir')
  const second = new UvRuntime(f.config); instances.push(second)
  const command = vi.spyOn(second, 'command').mockImplementation(f.runtime.command)
  await expect(second.prepare()).rejects.toThrow('must not redirect')
  expect(command.mock.calls.some(([, args]) => args.some(value => value.includes('sysconfig.get_path')))).toBe(false)
})

it('does not reflect malformed receipt contents in preparation failures', async () => {
  const f = await fixture(); await f.runtime.prepare()
  await writeFile(join(f.config.environmentRoot, 'active.json'), 'private-token-should-not-appear')
  const second = new UvRuntime(f.config); instances.push(second)
  vi.spyOn(second, 'command').mockImplementation(f.runtime.command)
  await expect(second.prepare()).rejects.toThrow('Python environment receipt is invalid')
  expect(second.error).not.toContain('private-token')
})

it('waits for active diagnostic children to exit on disposal and hides their error output', async () => {
  const f = await fixture(); f.command.mockRestore()
  vi.stubEnv('TEST_PYTHON_API_TOKEN', 'secret-value')
  expect(await f.runtime.command(process.execPath, ['-e', 'console.log(process.env.TEST_PYTHON_API_TOKEN ?? "absent")'])).toContain('absent')
  await expect(f.runtime.command(process.execPath, ['-e', 'process.stderr.write("https://user:password@example.org/?token=secret-value");process.exit(1)'])).rejects.toThrow('exit 1')
  const child = f.runtime.command(process.execPath, ['-e', 'setInterval(()=>{},1000)'])
  const settled = expect(child).rejects.toThrow('cancelled')
  await f.runtime.dispose(); await settled
})
