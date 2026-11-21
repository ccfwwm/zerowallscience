import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, onTestFinished, vi } from 'vitest'
import { ModelMetadata, parseModelCapacities } from '../src/account/host/model-metadata.js'

const catalog = { reseller: { models: { 'gpt-6.2-sol': { limit: { context: 200_000, output: 16_000 } } } },
  openai: { models: { 'gpt-6.2-sol': { limit: { context: 1_050_000, output: 128_000 } } } },
  anthropic: { models: { 'claude-fable-5-2': { limit: { context: 1_000_000, output: 128_000 } } } } }

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'model-metadata-'))
  onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  return join(root, 'catalog.json')
}

it('prefers author capacities and rejects an empty or invalid response', () => {
  expect(parseModelCapacities(catalog)['gpt-6.2-sol']).toEqual({ context: 1_050_000, output: 128_000 })
  for (const value of [null, [], {}, { bad: { models: { invalid: { limit: { context: -1 } } } } }]) {
    expect(() => parseModelCapacities(value)).toThrow()
  }
})

it('refreshes, caches and restores normalized Fable 5.2 and GPT 6.2 aliases offline', async () => {
  const path = await fixture()
  const metadata = new ModelMetadata()
  await metadata.refresh(path, new AbortController().signal, vi.fn(async () => Response.json(catalog)))
  expect(metadata.get('anthropic/claude-fable-5.2')).toEqual({ context: 1_000_000, output: 128_000 })
  expect(metadata.get('openai/gpt-6.2-sol')).toEqual({ context: 1_050_000, output: 128_000 })
  const offline = new ModelMetadata()
  await offline.load(path, new AbortController().signal)
  expect(offline.get('claude-fable-5-2')).toEqual(metadata.get('claude-fable-5-2'))
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ source: 'https://models.dev/api.json', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
})

it('retains a working snapshot and cache after network or validation failure', async () => {
  const path = await fixture()
  const metadata = new ModelMetadata()
  const signal = new AbortController().signal
  await metadata.refresh(path, signal, vi.fn(async () => Response.json(catalog)))
  const before = await readFile(path, 'utf8')
  for (const response of [new Response('', { status: 503 }), Response.json({})]) {
    await expect(metadata.refresh(path, signal, vi.fn(async () => response))).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe(before)
    expect(metadata.get('gpt-6.2-sol')?.context).toBe(1_050_000)
  }
  await writeFile(path, '{invalid')
  await metadata.load(path, signal)
  expect(metadata.get('gpt-6.2-sol')?.context).toBe(1_050_000)
})

it('publishes no metadata or cache when disposal wins against the response', async () => {
  const path = await fixture()
  let resolveResponse!: (value: Response) => void
  const response = { promise: new Promise<Response>(resolve => { resolveResponse = resolve }), resolve: (value: Response) => resolveResponse(value) }
  const abort = new AbortController()
  const metadata = new ModelMetadata()
  const before = metadata.get('gpt-6.2-sol')
  const operation = metadata.refresh(path, abort.signal, vi.fn(() => response.promise))
  abort.abort()
  response.resolve(Response.json({ openai: { models: { 'gpt-6.2-sol': { limit: { context: 12345 } } } } }))
  await expect(operation).rejects.toThrow()
  expect(metadata.get('gpt-6.2-sol')).toEqual(before)
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
})
