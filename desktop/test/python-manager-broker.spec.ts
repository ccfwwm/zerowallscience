import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PythonUpdaterService } from '../src/main/python-manager-broker.js'
import { assertWritablePythonRuntimePath } from '../src/main/python-location.js'
import { protectedPythonChannel } from '../src/main/python-protected-channel.js'
import { fork } from 'node:child_process'

vi.mock('../src/main/python-location.js', () => ({ assertWritablePythonRuntimePath: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../src/main/python-protected-channel.js', () => ({ protectedPythonChannel: vi.fn() }))

const roots: string[] = []; const brokers: PythonUpdaterService[] = []
afterEach(async () => { await Promise.all(brokers.splice(0).map(b => b.shutdown())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); vi.clearAllMocks(); vi.mocked(assertWritablePythonRuntimePath).mockResolvedValue(undefined) })
function canonical(value: any): any { return Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value }
async function fixture(root: string, name: string) {
  const directory = join(root, name); await mkdir(directory)
  const source = `let busy=false;process.on('message', m=>{if(m.type==='configure'){process.send({type:'configured',abi:1});process.send({type:'activity',busy:false});return}if(m.type==='shutdown')process.exit(0);if(m.method==='updateForUser'){busy=true;process.send({type:'activity',busy});setTimeout(()=>{busy=false;process.send({type:'activity',busy})},1000);process.send({id:m.id,result:{phase:'checking',updateJob:{taskId:'job-'+process.pid}}});return}process.send({id:m.id,result:{pid:process.pid,name:${JSON.stringify(name)},busy}})})`
  const file = 'python-updater-worker.js'; await writeFile(join(directory, file), source)
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const payload = { schema: 1, abi: 1, version: name, entry: file, localOnly: false, files: [{ path: file, size: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }] }
  const signature = { algorithm: 'ed25519', keyId: name, value: sign(null, Buffer.from(JSON.stringify(canonical(payload))), privateKey).toString('base64') }
  await writeFile(join(directory, 'worker-manifest.json'), JSON.stringify({ ...payload, signature }))
  return { entry: join(directory, file), key: publicKey.export({ format: 'pem', type: 'spki' }).toString() }
}
describe('signed plugin worker broker', () => {
  it('blocks automatic protected writes and arbitrary packages before requesting elevation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-broker-')); roots.push(root)
    const worker = await fixture(root, 'signed')
    const broker = new PythonUpdaterService({ root, runtimeRoot: join(root, 'Python'), publish: vi.fn(), resolveWorker: async () => worker.entry, publicKeys: { signed: worker.key } } as never); brokers.push(broker)
    vi.mocked(assertWritablePythonRuntimePath).mockRejectedValue(new Error('EACCES'))
    await expect(broker.environmentRequest({ action: 'sync', automatic: true, confirm: true } as never)).rejects.toThrow('PYTHON_AUTHORIZATION_REQUIRED')
    await expect(broker.environmentRequest({ action: 'install_package', confirm: true } as never)).rejects.toThrow('PYTHON_PROTECTED_OPERATION_DENIED')
    expect(protectedPythonChannel).not.toHaveBeenCalled()
  })
  it('dispatches confirmed signed transactions to a separate worker and keeps read-only scans unelevated', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-broker-')); roots.push(root)
    const worker = await fixture(root, 'signed'), runtimeRoot = join(root, 'Python')
    const broker = new PythonUpdaterService({ root, runtimeRoot, publish: vi.fn(), resolveWorker: async () => worker.entry, publicKeys: { signed: worker.key } } as never); brokers.push(broker)
    const original = await broker.pythonInfo() as any
    vi.mocked(assertWritablePythonRuntimePath).mockRejectedValue(new Error('EACCES'))
    vi.mocked(protectedPythonChannel).mockImplementation(async entry => fork(entry, [], { execArgv: [], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }))
    const protectedResult = await broker.environmentRequest({ action: 'sync', confirm: true } as never) as any
    expect(protectedResult.pid).not.toBe(original.pid)
    expect(protectedPythonChannel).toHaveBeenCalledWith(worker.entry, runtimeRoot)
    expect((await broker.pythonInfo() as any).pid).toBe(original.pid)
  })
  it('starts new tasks on the new worker and keeps nested task ownership on the busy previous worker', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-broker-')); roots.push(root)
    const first = await fixture(root, 'one'); const second = await fixture(root, 'two')
    let entry = first.entry
    const broker = new PythonUpdaterService({ root, publish: vi.fn(), resolveWorker: async () => entry, publicKeys: { one: first.key, two: second.key } } as never); brokers.push(broker)
    const accepted = await broker.updateForUser(); const taskId = accepted.updateJob!.taskId
    entry = second.entry
    const fresh = await broker.rpc<any>('manager', 'pythonInfo')
    expect(fresh.name).toBe('two')
    const owned = await broker.rpc<any>('manager', 'taskStatus', [taskId], taskId)
    expect(owned).toMatchObject({ name: 'one', busy: true })
    expect(owned.pid).not.toBe(fresh.pid)
  })
  it('rejects altered and unsigned worker files before spawning', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-broker-')); roots.push(root)
    const worker = await fixture(root, 'signed')
    const broker = new PythonUpdaterService({ root, publish: vi.fn(), resolveWorker: async () => worker.entry, publicKeys: { signed: worker.key } } as never); brokers.push(broker)
    await writeFile(join(root, 'signed', 'injected.js'), 'throw 1')
    await expect(broker.pythonInfo()).rejects.toThrow('PYTHON_WORKER_FILES')
    await rm(join(root, 'signed', 'injected.js'))
    await writeFile(worker.entry, 'altered')
    await expect(broker.pythonInfo()).rejects.toThrow('PYTHON_WORKER_HASH')
  })
  it('loads the actual independently bundled worker and performs a read-only scan with no Python present', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-broker-')); roots.push(root)
    const entry = resolve(import.meta.dirname, '../../plugins/python/lib/worker/python-updater-worker.js')
    const publicKeys = JSON.parse(await readFile(resolve(import.meta.dirname, '../../config/catalogs/trusted-keys.json'), 'utf8'))
    const broker = new PythonUpdaterService({ root: join(root, 'Python/.zerowall'), runtimeRoot: join(root, 'Python'), publish: vi.fn(), resolveWorker: async () => entry, publicKeys, allowDevelopment: true } as never); brokers.push(broker)
    broker.configureManager({ sync: { root: join(root, 'Python/.zerowall') }, locationPath: join(root, 'location.json') })
    await expect(broker.pythonInfo()).resolves.toMatchObject({ ready: false, inventoryComplete: true, packages: [] })
  })
})
