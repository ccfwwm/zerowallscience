import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { PythonUpdaterService } from '../src/main/python-manager-broker.js'

const roots: string[] = [], brokers: PythonUpdaterService[] = []
afterEach(async () => { await Promise.all(brokers.splice(0).map(broker => broker.shutdown())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
it.skipIf(!process.env.ZEROWALL_TEST_BOOTSTRAP_ROOT)('loads the published tarball through the unchanged signed broker, scans installed names, preserves locked inventory, and skips an existing package', async () => {
  const base = await mkdtemp(join(tmpdir(), 'zws-packed-python-')); roots.push(base)
  await promisify(execFile)('tar', ['-xf', process.env.ZEROWALL_TEST_PYTHON_PLUGIN_ARCHIVE ?? resolve('../artifacts/release/8.1.3/plugins/plugin-python/0.1.8/zerowallscience-plugin-python-0.1.8.tgz'), '-C', base])
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

it.skipIf(!process.env.ZEROWALL_TEST_BOOTSTRAP_ROOT || !process.env.ZEROWALL_TEST_PYTHON_PLUGIN_ARCHIVE).each(['legacy', 'absent'] as const)('upgrades the signed worker and installs a missing science package with %s metadata at the fixed path', async pointer => {
  const base = await mkdtemp(join(tmpdir(), 'zws-fixed-worker-upgrade-')); roots.push(base)
  const old = join(base, 'old'), updated = join(base, 'updated')
  await mkdir(old); await mkdir(updated)
  const unpack = async (archive: string, destination: string) => promisify(execFile)('tar', ['-xf', archive, '-C', destination])
  await unpack(resolve('../artifacts/release/8.1.3/plugins/plugin-python/0.1.10/zerowallscience-plugin-python-0.1.10.tgz'), old)
  await unpack(process.env.ZEROWALL_TEST_PYTHON_PLUGIN_ARCHIVE!, updated)
  const updatedVersion = JSON.parse(await readFile(join(updated, 'package/package.json'), 'utf8')).version
  const source = process.env.ZEROWALL_TEST_BOOTSTRAP_ROOT!, runtime = join(base, '安装 目录', 'Python'), manager = join(runtime, '.zerowall'), site = join(runtime, 'Lib/site-packages')
  await mkdir(site, { recursive: true }); await mkdir(manager)
  for (const entry of await readdir(source, { withFileTypes: true })) if (entry.isFile()) await cp(join(source, entry.name), join(runtime, entry.name))
  for (const entry of await readdir(join(source, 'Lib/site-packages'))) if (/^pip(?:$|-)/u.test(entry)) await cp(join(source, 'Lib/site-packages', entry), join(site, entry), { recursive: true })
  await mkdir(join(site, 'pandas-1.0.0.dist-info')); await writeFile(join(site, 'pandas-1.0.0.dist-info/METADATA'), 'Metadata-Version: 2.1\nName: pandas\nVersion: 1.0.0\n')
  await writeFile(join(site, 'user-sentinel.txt'), 'keep existing files')
  const stale = JSON.stringify({ root: join(manager, 'slots', 'a-old'), generation: true, health: 'ready', customizations: { legacy: '9' } })
  if (pointer === 'legacy') await writeFile(join(manager, 'current.json'), stale)
  const keys = generateKeyPairSync('ed25519')
  const manifest = { schema: 3, runtimeId: 'zerowall-science-python', platform: 'win32-x64', pythonVersion: '3.12.10', environmentVersion: '3.12.10', revision: 'fixed-worker-pilot', layer: 'science', createdAt: new Date().toISOString(), index: { indexUrl: 'https://mirrors.ustc.edu.cn/pypi/simple' }, compatibility: { minApplicationVersion: '8.1.3' }, packages: [{ name: 'pandas', version: '3.0.5', required: true, capabilities: [] }, { name: 'six', version: '1.17.0', required: true, capabilities: [] }], signature: { algorithm: 'ed25519', keyId: 'pilot', value: '' } }
  const { signature, ...unsigned } = manifest
  signature.value = sign(null, Buffer.from(JSON.stringify(unsigned)), keys.privateKey).toString('base64')
  const manifestPath = join(base, 'science.json'); await writeFile(manifestPath, JSON.stringify(manifest))
  const publicKeys = { ...JSON.parse(await readFile(resolve('../config/catalogs/trusted-keys.json'), 'utf8')), pilot: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
  let worker = join(old, 'package/lib/worker/python-updater-worker.js')
  const broker = new PythonUpdaterService({ root: manager, runtimeRoot: runtime, publicKeys, publicKey: publicKeys['stable-4'], generationMode: false, coordinateHost: false, manifestUrl: 'https://unused.invalid/bootstrap', publish() {}, resolveWorker: async () => worker } as never); brokers.push(broker)
  broker.configureManager({ sync: { root: manager, keys: publicKeys, applicationVersion: '8.1.3', feedUrl: 'https://unused.invalid', bundledManifestPath: manifestPath }, applicationInstallRoot: join(base, '安装 目录'), locationPath: join(base, 'location.json') })
  const interpreterBefore = await readFile(join(runtime, 'python.exe'))
  expect(await broker.pythonInfo()).toMatchObject({ ready: true, executable: join(runtime, 'python.exe') })
  if (pointer === 'legacy') await expect(broker.rpc('controller', 'previewDependencyManifest', [manifest])).rejects.toThrow('PYTHON_FIXED_PATH_REQUIRED')
  else await expect(broker.rpc('controller', 'previewDependencyManifest', [manifest])).rejects.toThrow('尚未就绪')
  const previousTask = await broker.environmentRequest({ action: 'sync', layer: 'science', confirm: true, requestId: `old-science-${pointer}` })
  await expect.poll(async () => (await broker.environmentRequest({ action: 'task_status', taskId: String(previousTask.taskId), requestId: 'old-result' })).task, { timeout: 30_000, interval: 500 }).toMatchObject({ state: 'failed', error: expect.stringContaining(pointer === 'legacy' ? 'PYTHON_FIXED_PATH_REQUIRED' : '尚未就绪') })
  worker = join(updated, 'package/lib/worker/python-updater-worker.js')
  const plan = await broker.rpc<any>('controller', 'previewDependencyManifest', [manifest])
  expect(plan).toMatchObject({ snapshotId: runtime, changes: [{ name: 'six', to: '1.17.0' }] })
  if (pointer === 'legacy') expect(await readFile(join(manager, 'current.json'), 'utf8')).toBe(stale)
  else await expect(readFile(join(manager, 'current.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  const accepted = await broker.environmentRequest({ action: 'sync', layer: 'science', confirm: true, requestId: `fixed-science-${pointer}` })
  await expect.poll(async () => (await broker.environmentRequest({ action: 'task_status', taskId: String(accepted.taskId), requestId: 'pilot-result' })).task, { timeout: 120_000, interval: 1000 }).toMatchObject({ state: 'succeeded', completedPackages: 1, totalPackages: 1, currentPackage: 'six', result: { verification: { installedPackageCount: 2, pendingPackageCount: 0 } } })
  const info = await broker.pythonInfo()
  expect(info.packages.find(pkg => pkg.name === 'pandas')?.version).toBe('1.0.0')
  expect(info.packages.find(pkg => pkg.name === 'six')?.version).toBe('1.17.0')
  expect(info.executable).toBe(join(runtime, 'python.exe'))
  expect(await readFile(join(runtime, 'python.exe'))).toEqual(interpreterBefore)
  expect(await readFile(join(site, 'user-sentinel.txt'), 'utf8')).toBe('keep existing files')
  expect(JSON.parse(await readFile(join(manager, 'current.json'), 'utf8'))).toMatchObject({ root: runtime, generation: false, health: 'ready' })
  expect(await readdir(manager)).not.toContain('slots')
  const executed = await promisify(execFile)(join(runtime, 'python.exe'), ['-I', '-B', '-c', 'import six; print(six.__version__)'], { windowsHide: true })
  expect(executed.stdout.trim()).toBe('1.17.0')
  if (process.env.ZEROWALL_TEST_PYTHON_EVIDENCE) {
    await mkdir(process.env.ZEROWALL_TEST_PYTHON_EVIDENCE, { recursive: true })
    await writeFile(join(process.env.ZEROWALL_TEST_PYTHON_EVIDENCE, `fixed-worker-${pointer}.json`), JSON.stringify({ pointer, previousVersion: '0.1.10', currentVersion: updatedVersion, oldTask: (await broker.environmentRequest({ action: 'task_status', taskId: String(previousTask.taskId), requestId: 'old-evidence' })).task, newTask: (await broker.environmentRequest({ action: 'task_status', taskId: String(accepted.taskId), requestId: 'new-evidence' })).task, executable: info.executable, pandas: info.packages.find(pkg => pkg.name === 'pandas')?.version, six: executed.stdout.trim(), interpreterUnchanged: true, userFilesPreserved: true, noSlots: true, verifiedAt: new Date().toISOString() }, null, 2))
  }
}, 180_000)
