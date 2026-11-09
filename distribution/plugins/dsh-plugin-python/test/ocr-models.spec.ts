import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { OcrModels } from '../src/host/ocr-models.js'

const roots: string[] = []
const instances: OcrModels[] = []
afterEach(async () => { await Promise.all(instances.splice(0).map(instance => instance.dispose())); vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'OCR 模型 ')); roots.push(root)
  const body = Buffer.from('verified model')
  const manifest = join(root, 'manifest.json')
  await writeFile(manifest, JSON.stringify({ schemaVersion: 1, version: 'test', models: [{ name: 'model.onnx', url: 'https://models.example.org/release/model.onnx', bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') }] }))
  const config = { root: join(root, 'cache'), manifest, mirror: 'https://mirror.example.org/models', attempts: 2, timeoutMs: 30000, retryDelayMs: 0 }
  const models = new OcrModels(config); instances.push(models)
  return { root, body, config, models }
}
it('shares concurrent preparation, verifies the mirror download and reuses it offline after restart', async () => {
  const f = await fixture(); const download = vi.fn().mockImplementation(async () => new Response(f.body)); vi.stubGlobal('fetch', download)
  const first = f.models.prepare(); expect(f.models.prepare()).toBe(first)
  const directory = await first
  expect(download).toHaveBeenCalledOnce(); expect(download.mock.calls[0]![0]).toBe('https://mirror.example.org/models/model.onnx')
  expect(await readFile(join(directory, 'model.onnx'))).toEqual(f.body)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  const next = new OcrModels(f.config); instances.push(next)
  expect(await next.prepare()).toBe(directory); expect(next.status.phase).toBe('ready'); expect(fetch).not.toHaveBeenCalled()
})
it('exhausts a bounded network retry and allows explicit recovery without a partial model', async () => {
  const f = await fixture(); const download = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', download)
  await expect(f.models.prepare()).rejects.toMatchObject({ code: 'OCR_DOWNLOAD_FAILED' })
  expect(download).toHaveBeenCalledTimes(2); expect(f.models.status.phase).toBe('failed')
  download.mockImplementation(async () => new Response(f.body))
  await f.models.retry(); expect(f.models.status.phase).toBe('ready')
})
it('rejects a corrupt model without committing it or repeatedly downloading invalid content', async () => {
  const f = await fixture(); const download = vi.fn().mockResolvedValue(new Response(Buffer.alloc(f.body.length))); vi.stubGlobal('fetch', download)
  await expect(f.models.prepare()).rejects.toMatchObject({ code: 'OCR_MODEL_INTEGRITY' })
  expect(download).toHaveBeenCalledOnce()
  const directories = await readdir(f.config.root)
  expect(await readdir(join(f.config.root, directories[0]!))).toEqual([])
})
it('cancels an in-flight transfer and waits for cleanup before disposal returns', async () => {
  const f = await fixture(); let started!: () => void; const entered = new Promise<void>(resolve => { started = resolve })
  vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }); started() })))
  const result = f.models.prepare().catch(error => error)
  await entered; await f.models.dispose()
  expect(await result).toMatchObject({ code: 'OCR_CANCELLED' }); expect(f.models.status.phase).toBe('failed')
  await expect(f.models.retry()).rejects.toMatchObject({ code: 'OCR_CANCELLED' })
})
