import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { PythonUpdaterService } from '../src/main/python-manager-broker.js'

const roots: string[] = [], brokers: PythonUpdaterService[] = []
afterEach(async () => { await Promise.all(brokers.splice(0).map(broker => broker.shutdown())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
it.skipIf(!process.env.ZEROWALL_TEST_BOOTSTRAP_ROOT)('loads the published tarball through the unchanged signed broker, scans installed names, preserves locked inventory, and skips an existing package', async () => {
  const base = await mkdtemp(join(tmpdir(), 'zws-packed-python-')); roots.push(base)
  await promisify(execFile)('tar', ['-xf', resolve('../artifacts/release/8.1.3/plugins/plugin-python/0.1.8/zerowallscience-plugin-python-0.1.8.tgz'), '-C', base])
  const source = process.env.ZEROWALL_TEST_BOOTSTRAP_ROOT!, runtime = join(base, '安装 目录/Python'), manager = join(runtime, '.zerowall')
  await mkdir(join(runtime, 'Lib/site-packages'), { recursive: true }); await mkdir(manager)
  for (const entry of await readdir(source, { withFileTypes: true })) if (entry.isFile()) await cp(join(source, entry.name), join(runtime, entry.name))
  for (const entry of await readdir(join(source, 'Lib/site-packages'))) if (/^pip(?:$|-)/u.test(entry)) await cp(join(source, 'Lib/site-packages', entry), join(runtime, 'Lib/site-packages', entry), { recursive: true })
  const manifest = JSON.parse(await readFile(resolve('../resources/extensions/python/core-dependency-manifest.json'), 'utf8'))
  for (const [i, pkg] of manifest.packages.entries()) {
    if (pkg.name === 'pip') continue
    const directory = join(runtime, 'Lib/site-packages', `${pkg.name.replaceAll('-', '_')}-${i + 1}.0.dist-info`)
    await mkdir(directory); await writeFile(join(directory, 'METADATA'), `Metadata-Version: 2.1\nName: ${pkg.name}\nVersion: ${i + 1}.0\n`)
  }
  const publicKeys = JSON.parse(await readFile(resolve('../config/catalogs/trusted-keys.json'), 'utf8'))
  const broker = new PythonUpdaterService({ root: manager, runtimeRoot: runtime, publicKeys, generationMode: false, coordinateHost: false, manifestUrl: 'https://unused.invalid', coreDependencyManifestPath: resolve('../resources/extensions/python/core-dependency-manifest.json'), publish() {}, resolveWorker: async () => join(base, 'package/lib/worker/python-updater-worker.js') } as never)
  brokers.push(broker)
  broker.configureManager({ sync: { root: manager, keys: publicKeys, applicationVersion: '8.1.3', feedUrl: 'https://unused.invalid', bundledCoreManifestPath: resolve('../resources/extensions/python/core-dependency-manifest.json'), bundledManifestPath: resolve('../resources/extensions/python/dependency-manifest.json') }, applicationInstallRoot: join(base, '安装 目录'), locationPath: join(base, 'location.json') })
  const info = await broker.pythonInfo()
  expect(info).toMatchObject({ inventoryComplete: true, ready: true, coreReady: true, corePackageCount: 43, officialPackageCount: 43, executable: join(runtime, 'python.exe') })
  expect(info.packages.every(pkg => pkg.version !== manifest.packages.find((entry: any) => entry.name === pkg.name)?.version || pkg.name === 'pip')).toBe(true)
  await broker.environmentRequest({ action: 'scan_local', requestId: 'initial-scan' })
  await expect.poll(async () => (await broker.environmentRequest({ action: 'status', requestId: 'scan-result' })).scan).toMatchObject({ state: 'complete', inventory: { corePackageCount: 43 } })
  await writeFile(join(manager, 'write-lock.json'), JSON.stringify({ pid: process.pid }))
  await broker.environmentRequest({ action: 'scan_local', requestId: 'locked-scan' })
  await expect.poll(async () => (await broker.environmentRequest({ action: 'status', requestId: 'locked-result' })).scan).toMatchObject({ state: 'complete', inventory: { corePackageCount: 43 } })
  await rm(join(manager, 'write-lock.json'))
  const queued = await broker.environmentRequest({ action: 'install_package', packageSpec: 'pandas', confirm: true, requestId: 'keep-pandas' })
  await expect.poll(async () => (await broker.environmentRequest({ action: 'task_status', taskId: String(queued.taskId), requestId: 'task-result' })).task, { timeout: 30_000 }).toMatchObject({ state: 'succeeded', result: { upToDate: true, installed: 0 } })
}, 60_000)
