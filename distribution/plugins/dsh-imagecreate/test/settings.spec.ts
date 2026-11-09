import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import type { AiCloudAccountSnapshot, AiCloudManagedModel } from '@zerowall/dsh-plugin-ai-cloud/account-types'

vi.mock('@deepseek-ai/dsh-typert-protocol', () => ({ Remote: () => () => {}, TypertRemoteService: class {} }))
const secrets = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@zerowall/dsh-plugin-ai-cloud/secrets', () => ({ SecretBrokerClient: class { get = secrets.get } }))
import { ImageSettingsService } from '../src/host/settings.js'

const roots: string[] = [], disposers: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose(); for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true }); vi.restoreAllMocks() })
const model = { providerId: 'real-provider', groupId: 'real-group', groupName: '生图分组-香蕉生图', modelId: 'gemini-nano-banana-2.1', capability: 'image-generation' as const, baseUrl: 'https://example.test/v1' }
const snapshot = (models: AiCloudManagedModel[] = [model]): AiCloudAccountSnapshot => ({ status: 'signedIn', balanceFreshness: 'current', lowBalance: false, models })
async function fixture(options: { home?: string; legacy?: object; media?: object } = {}) {
  const home = options.home ?? await mkdtemp(join(tmpdir(), '生图 设置 '))
  if (!options.home) roots.push(home)
  const ctx = new Context()
  Object.defineProperty(ctx, 'credentials', { value: {} })
  Object.defineProperty(ctx, 'zerowallEnvironment', { value: { readImageModelSelection: async () => options.legacy, getImageQuality: () => 'medium' } })
  Object.defineProperty(ctx, 'logger', { value: { error: vi.fn() } })
  secrets.get.mockResolvedValue(options.media ? JSON.stringify(options.media) : undefined)
  let service!: ImageSettingsService
  const fork = ctx.plugin(scope => { service = new ImageSettingsService(scope, { home, preferredGroupName: model.groupName, preferredModelId: model.modelId }) })
  await fork
  disposers.push(() => fork.dispose())
  return { home, service, path: join(home, 'zerowall/imagecreate/settings.json') }
}

it('initializes the exact real route on login and preserves user parameters through synchronization and restart', async () => {
  const { home, service } = await fixture()
  await service.updateAccount(snapshot())
  expect(await service.get()).toMatchObject({ origin: 'automatic', availability: 'ready', selection: { providerId: model.providerId, groupId: model.groupId, modelId: model.modelId } })
  const user = { ...model, modelId: 'user-model', resolution: '1536x1024' }
  const syncing = service.updateAccount(snapshot())
  const saving = service.save({ selection: user, quality: 'max' })
  await Promise.all([syncing, saving])
  await service.updateAccount(snapshot([{ ...model, providerId: 'new-provider' }]))
  expect(await service.get()).toMatchObject({ origin: 'user', quality: 'max', availability: 'missing', selection: { modelId: 'user-model', resolution: '1536x1024' } })
  const restored = await fixture({ home })
  await restored.service.updateAccount(snapshot())
  expect(await restored.service.get()).toMatchObject({ origin: 'user', selection: { modelId: 'user-model' }, quality: 'max' })
})

it('waits for an unambiguous permitted catalog entry and never selects an unrelated first entry', async () => {
  const { service } = await fixture()
  await service.updateAccount(snapshot([{ ...model, modelId: 'other' }]))
  expect(await service.get()).toMatchObject({ availability: 'missing', selection: undefined })
  await service.updateAccount(snapshot([model, { ...model, providerId: 'other-provider' }]))
  expect(await service.get()).toMatchObject({ availability: 'ambiguous', selection: undefined })
  await service.updateAccount(snapshot([model, model]))
  expect(await service.get()).toMatchObject({ availability: 'ready' })
  await service.updateAccount(snapshot([{ ...model, stale: true }]))
  expect((await service.get()).selection).toBeUndefined()
  await service.updateAccount({ ...snapshot([]), status: 'signedOut' })
  expect((await service.get()).availability).toBe('signed-out')
})

it('migrates an existing environment route once, preserving its backup and user ownership', async () => {
  const legacy = { ...model, modelId: 'existing-choice', aspectRatio: '16:9' }
  const first = await fixture({ legacy })
  await first.service.updateAccount(snapshot())
  expect(await first.service.get()).toMatchObject({ origin: 'user', selection: { modelId: 'existing-choice', aspectRatio: '16:9' } })
  expect(JSON.parse(await readFile(first.path, 'utf8')).legacyBackup.environment.imageModel.modelId).toBe('existing-choice')
  const second = await fixture({ home: first.home, legacy: model })
  expect((await second.service.get()).selection?.modelId).toBe('existing-choice')
})

it('resolves legacy media identity from the real catalog and retains its quality', async () => {
  const { service } = await fixture({ media: { image: { selection: { groupId: model.groupId, modelId: model.modelId, profileId: 'native-profile' }, parameters: { quality: 'max', size: '2048x2048' } } } })
  expect(await service.get()).toMatchObject({ origin: 'user', selection: undefined, quality: 'max' })
  await service.updateAccount(snapshot([{ ...model, profileId: 'native-profile' } as AiCloudManagedModel]))
  expect(await service.get()).toMatchObject({ origin: 'user', quality: 'max', selection: { providerId: model.providerId, resolution: '2048x2048' } })
})

it('rejects damaged stored settings and invalid remote writes without overwriting data', async () => {
  const first = await fixture(); await first.service.get()
  await expect(first.service.save({ selection: { ...model, providerId: '' }, quality: 'high' })).rejects.toThrow()
  await writeFile(first.path, '{broken')
  const second = await fixture({ home: first.home })
  await expect(second.service.get()).rejects.toThrow()
  expect(await readFile(first.path, 'utf8')).toBe('{broken')
})
