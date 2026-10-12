import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareFallbackWheel, mayUseFallbackWheel } from '../../plugins/python/src/worker/python-fallback-wheel.js'
import { ownedDistributionFiles } from '../../plugins/python/src/worker/python-packages.js'
import { withPythonOperation } from '../../plugins/python/src/worker/python-operation.js'
import { applyPackagePlanFiles } from '../../plugins/python/src/worker/python-packages.js'
import { parsePythonDependencyManifest } from '../../plugins/python/src/worker/python-dependency-manifest.js'

const sourceBuild = vi.hoisted(() => vi.fn())
vi.mock('../../plugins/python/src/worker/python-source-packages.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../plugins/python/src/worker/python-source-packages.js')>(),
  prepareSourceWheel: sourceBuild,
}))

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const runtime = process.env.ZEROWALL_TEST_BIOGENIE_RUNTIME
describe.skipIf(!runtime)('actual signed fallback wheel and RECORD ownership', () => {
  async function setup() {
    const root = await mkdtemp(join(tmpdir(), 'python-wheel-')); roots.push(root)
    const wheels = JSON.parse(await readFile(resolve('../resources/extensions/python/fallback-wheels.json'), 'utf8'))
    const wheel = wheels.find((item: any) => item.name === 'flowio')
    const bytes = await readFile(resolve('../artifacts/release/8.1.3/python-wheels', wheel.filename))
    return { root, wheel, bytes, executable: join(runtime!, 'python.exe'), manifest: { fallbackWheels: [wheel] } as any }
  }
  it('validates a real wheel and rejects tampered bytes, incompatible tags, cancellation and unavailable storage', async () => {
    const f = await setup()
    expect(await prepareFallbackWheel(join(f.root, 'valid'), f.executable, f.manifest, 'FLOWIO', vi.fn(async () => new Response(f.bytes)))).toMatchObject({ name: 'flowio', version: '1.4.0', hash: f.wheel.sha256 })
    const damaged = Buffer.from(f.bytes); damaged[damaged.length - 1] = damaged[damaged.length - 1]! ^ 1
    await expect(prepareFallbackWheel(join(f.root, 'damaged'), f.executable, f.manifest, 'flowio', vi.fn(async () => new Response(damaged)))).rejects.toThrow(/SHA-256|hash|校验/)
    const incompatible = { fallbackWheels: [{ ...f.wheel, tags: ['cp311-cp311-linux_x86_64'] }] } as any
    await expect(prepareFallbackWheel(join(f.root, 'tags'), f.executable, incompatible, 'flowio', vi.fn(async () => new Response(f.bytes)))).rejects.toThrow('wheel tags incompatible')
    const cancelled = new AbortController(); cancelled.abort(); const fetcher = vi.fn()
    await expect(withPythonOperation(cancelled.signal, () => prepareFallbackWheel(f.root, f.executable, f.manifest, 'flowio', fetcher))).rejects.toThrow('CANCELLED')
    expect(fetcher).not.toHaveBeenCalled()
    await expect(prepareFallbackWheel(join(f.root, 'offline'), f.executable, f.manifest, 'flowio', vi.fn(async () => new Response('', { status: 503 })))).rejects.toThrow('503')
    expect(mayUseFallbackWheel(new Error('PEP 517 backend failed'))).toBe(true)
    for (const message of ['AbortError', 'PYTHON_OPERATION_CANCELLED', 'SHA-256 mismatch', 'signature invalid']) expect(mayUseFallbackWheel(new Error(message))).toBe(false)
  })
  it('preserves files listed by another retained distribution when removing a package', async () => {
    const f = await setup(); const site = join(f.root, 'site')
    await mkdir(site)
    await writeFile(join(site, 'shared.py'), 'shared')
    await writeFile(join(site, 'a.py'), 'a')
    for (const name of ['a', 'b']) {
      const dist = join(site, `${name}-1.0.dist-info`); await mkdir(dist)
      await writeFile(join(dist, 'METADATA'), `Metadata-Version: 2.1\nName: ${name}\nVersion: 1.0\n`)
      await writeFile(join(dist, 'RECORD'), `shared.py,,\n${name === 'a' ? 'a.py,,\n' : ''}${name}-1.0.dist-info/METADATA,,\n${name}-1.0.dist-info/RECORD,,\n`)
    }
    const owned = await ownedDistributionFiles(f.executable, site, ['A'])
    expect(owned).toContain('a.py'); expect(owned).not.toContain('shared.py')
    expect(await ownedDistributionFiles(f.executable, site, ['a', 'b'])).toContain('shared.py')
  })
})

describe.skipIf(!process.env.ZEROWALL_TEST_BOOTSTRAP_ROOT)('source failure to public signed wheel installation', () => {
  it('downloads the real Qiniu wheel and commits it to the same fixed interpreter after PEP 517 fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zws-public-wheel-')); roots.push(root)
    const fixed = join(root, '安装 目录', 'Python')
    await cp(process.env.ZEROWALL_TEST_BOOTSTRAP_ROOT!, fixed, { recursive: true })
    const executable = join(fixed, 'python.exe'), sitePackages = join(fixed, 'Lib/site-packages')
    const keys = JSON.parse(await readFile(resolve('../artifacts/release/8.1.3/catalogs/verification-keys.json'), 'utf8'))
    const signed = parsePythonDependencyManifest(JSON.parse(await readFile(resolve('../artifacts/release/8.1.3/python-dependencies/manifest-3.12.10-r18.json'), 'utf8')), keys, '8.1.3')
    const source = signed.packages.find(pkg => pkg.name === 'docopt')!
    const fallback = signed.fallbackWheels!.find(wheel => wheel.name === 'docopt')!
    const manifest = { ...signed, packages: [source], fallbackWheels: [fallback] }
    const management = join(fixed, '.zerowall')
    const context = { root: fixed, executable, sitePackages, manifest: { python: { relativeExecutable: 'python.exe', relativeSitePackages: 'Lib/site-packages' } } as any, mirror: { indexUrl: 'https://pypi.org/simple' } }
    const before = createHash('sha256').update(await readFile(executable)).digest('hex')
    const logs: string[] = []
    sourceBuild.mockRejectedValue(new Error('PEP 517 backend failed: acceptance fault injection'))
    const outcome = await applyPackagePlanFiles(management, context, fixed, {
      planId: 'public-fallback', snapshotId: fixed, requested: ['docopt==0.6.2'], changes: [{ name: 'docopt', to: '0.6.2' }],
      dependencyManifest: manifest, manifestInstalled: [],
      wheels: [{ name: source.name, version: source.version, sourceFilename: source.filename, sourceArchiveSha256: source.sha256, deferredSourceBuild: true }],
    }, progress => { if (progress.logLine) logs.push(progress.logLine) })
    expect(outcome).toMatchObject({ installed: 1, skipped: [], importCheckPassed: true })
    expect(sourceBuild).toHaveBeenCalledTimes(1)
    expect(logs.join('\n')).toContain('七牛签名 wheel')
    const installed = await promisify(execFile)(executable, ['-I', '-X', 'utf8', '-c', "import sys,json,docopt,importlib.metadata as m; print(json.dumps({'executable':sys.executable,'version':m.version('docopt'),'result':docopt.docopt('Usage: example NAME',['Ada'])}))"], { windowsHide: true })
    expect(JSON.parse(installed.stdout)).toEqual({ executable, version: '0.6.2', result: { NAME: 'Ada' } })
    expect(createHash('sha256').update(await readFile(executable)).digest('hex')).toBe(before)
    const downloaded = await readFile(join(management, 'downloads/fallback-wheels', fallback.sha256, fallback.filename))
    expect(downloaded.length).toBe(fallback.size)
    expect(createHash('sha256').update(downloaded).digest('hex')).toBe(fallback.sha256)
    const revision = JSON.parse(await readFile(join(management, 'revision.json'), 'utf8'))
    expect(revision.transactionId).toBeTruthy()
  }, 120000)
})
