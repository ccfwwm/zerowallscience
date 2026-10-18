import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AiCloudMediaService } from '../src/host/media.js'
import { MediaJobLedger, MEDIA_COLLECTION_MAX_BACKOFF_MS, MEDIA_COLLECTION_POLL_MS } from '../src/host/media-jobs.js'
import type { AiCloudAccountSnapshot, AiCloudMediaModel } from '@zerowallscience/plugin-account/types'
import type { MediaJob } from '../src/shared/media.js'

const roots: string[] = []
const ledgers: MediaJobLedger[] = []
afterEach(async () => { await Promise.all(ledgers.splice(0).map(ledger => ledger.dispose())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers })
const box = (kind: string, data: Buffer) => { const header = Buffer.alloc(8); header.writeUInt32BE(data.length + 8); header.write(kind, 4); return Buffer.concat([header, data]) }
const handler = Buffer.alloc(12); handler.write('vide', 8)
const movie = Buffer.alloc(20); movie.writeUInt32BE(1000, 12); movie.writeUInt32BE(10125, 16)
// Structural MP4 fixture exercises the real signature, range, size and hash checks.
// Actual browser decoding remains covered by the packaged GUI media fixtures.
const video = Buffer.concat([box('ftyp', Buffer.from('isom0000')), box('moov', Buffer.concat([box('mvhd', movie), box('trak', box('mdia', box('hdlr', handler)))])), box('mdat', Buffer.alloc(2 * 1024 * 1024 + 17, 7))])

async function fixture(autoCollect = false) {
  const cwd = await mkdtemp(join(tmpdir(), 'zws-media-materialize-')); roots.push(cwd)
  const root = join(cwd, 'ledger'), selection = { groupId: '7', modelId: 'selected-video', profileId: 'original-profile', operation: 'video' }
  const model: AiCloudMediaModel = { ...selection, providerId: 'fixture', groupName: '图片音频视频分组', baseUrl: 'https://hkcode.aicodeme.xyz/v1', capability: 'media', version: '1', mediaType: 'video', operations: ['video'], sizes: [], qualities: [], resolutions: [], aspectRatios: [], duration: {}, materials: {}, formats: [], pollSeconds: 1 }
  const snapshot: AiCloudAccountSnapshot = { status: 'signedIn', email: 'fixture@example.test', gatewayBaseUrl: 'https://hkcode.aicodeme.xyz', balanceFreshness: 'current', lowBalance: false, models: [], mediaModels: [model], mediaSync: { status: 'succeeded', checkedAt: 'fixture', groups: [{ groupId: '7', groupName: '媒体', checkedAt: 'fixture', status: 'succeeded', count: 1 }] } }
  const values = new Map([['zerowall.ai-cloud.group.7', 'isolated-fixture-credential']])
  const secrets = { get: async (key: string) => values.get(key), set: async (key: string, value: string) => { values.set(key, value) }, delete: async (key: string) => { values.delete(key) } }
  const account = { current: async () => snapshot, discoverModels: async () => snapshot }
  const taskId = 'mt_original_video', artifact = { key: 'video1', mime_type: 'video/mp4', available: true, size_bytes: video.length, content_url: `/v1/tasks/${taskId}/artifacts/video1/content` }
  const reply = (artifacts: unknown[] = [artifact], status = 'completed') => ({ id: taskId, model: selection.modelId, status, artifacts })
  let queries = 0, downloads = 0, estimates = 0, submits = 0, now = 1_800_000_000_000
  let ownerLookup = async () => 'fixture-owner'
  let submitReply = async (): Promise<Response> => json(reply([], 'queued'), 202)
  let query = async (index: number): Promise<Response> => json(reply(autoCollect && index <= 2 ? [] : undefined, autoCollect && index <= 2 ? 'running' : 'completed'))
  let download = async (headers: Headers): Promise<Response> => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(headers.get('range') ?? '')!
    const start = Number(match[1]), end = Math.min(Number(match[2]), video.length - 1)
    return new Response(video.subarray(start, end + 1), { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${video.length}` } })
  }
  const seenRequests: string[] = [], sleeps: number[] = [], waiting: MediaJob[] = []
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input); seenRequests.push(url)
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer isolated-fixture-credential')
    if (url.endsWith('/estimates')) { estimates++; return json({ currency: 'USD', calculation: { total: '0.25' } }) }
    if (init?.method === 'POST') { submits++; return submitReply() }
    if (url.endsWith(`/v1/tasks/${taskId}`)) return query(++queries)
    if (url.endsWith(`/artifacts/video1/content`)) { downloads++; return download(new Headers(init?.headers)) }
    throw new Error('UNEXPECTED_FIXTURE_REQUEST')
  })
  const service = new AiCloudMediaService(account, secrets, { fetch: fetcher, cacheDir: join(cwd, 'cache') })
  const scope = { cwd, sessionId: 'original-session', projectId: 'original-project' }
  let onSleep: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined
  let job!: MediaJob
  const runtime = { autoCollect, now: () => now, sleep: async (ms: number, signal: AbortSignal) => {
    sleeps.push(ms); waiting.push(JSON.parse(await readFile(join(root, job.id + '.json'), 'utf8')).job)
    if (onSleep) return onSleep(ms, signal)
    now += ms
  } }
  const make = () => { const ledger = new MediaJobLedger(service, () => ownerLookup(), root, runtime); ledgers.push(ledger); return ledger }
  const ledger = make()
  job = await ledger.prepare(scope, { kind: 'video', prompt: '保留原提示词和模型参数', selection, parameters: {} })
  await ledger.submitRequested(scope, job.id, job.revision)
  if (autoCollect) await vi.waitFor(() => expect(submits).toBe(1), { timeout: 5000 })
  else await vi.waitFor(async () => expect((await ledger.list(scope))[0]?.state).toBe('queued'), { timeout: 5000 })
  const paidCounts = { estimates, submits }
  const read = async () => JSON.parse(await readFile(join(root, job.id + '.json'), 'utf8'))
  return { cwd, root, scope, job, taskId, selection, artifact, reply, service, ledger, make, sleeps, waiting, seenRequests,
    setQuery: (fn: typeof query) => { query = fn }, setDownload: (fn: typeof download) => { download = fn },
    setOwner: (fn: typeof ownerLookup) => { ownerLookup = fn }, setSubmit: (fn: typeof submitReply) => { submitReply = fn },
    setSleep: (fn: typeof onSleep) => { onSleep = fn }, advance: (ms: number) => { now += ms }, now: () => now,
    read, save: async (value: unknown) => writeFile(join(root, job.id + '.json'), JSON.stringify(value)),
    counts: () => ({ estimates, submits, queries, downloads }), paidCounts }
}

async function expectOriginal(f: Awaited<ReturnType<typeof fixture>>, result: MediaJob) {
  expect(result).toMatchObject({ id: f.job.id, requestId: f.job.requestId, taskId: f.taskId, selection: f.selection, state: 'completed', collection: 'ready' })
  expect(result.assets).toHaveLength(1)
  expect(result.assets[0]).toMatchObject({ id: 'video1', bytes: video.length, mediaType: 'video/mp4', sha256: digest(video), duration: 10.125 })
  expect(digest(await readFile(join(f.cwd, result.assets[0]!.path)))).toBe(digest(video))
  expect(f.counts()).toMatchObject(f.paidCounts)
  expect((await f.read()).submitted).toBe(true)
  expect(JSON.stringify(result)).not.toMatch(/isolated-fixture-credential|content_url|authorization/)
}

it.each(['empty', 'unavailable', 'missing-source'])('automatically collects the original completed task after %s artifacts become ready through real accept parsing', async mode => {
  const f = await fixture()
  f.setQuery(async index => json(f.reply(index <= 2 ? mode === 'empty' ? [] : [{ ...f.artifact, ...(mode === 'unavailable' ? { available: false } : { content_url: undefined }) }] : undefined)))
  await expectOriginal(f, await f.ledger.refresh(f.scope, f.job.id))
  expect(f.counts().queries).toBe(3); expect(f.counts().downloads).toBe(3)
  expect(f.sleeps).toEqual([2000, 4000])
  expect(f.waiting.every(job => job.collection === 'waiting' && job.state === 'completed')).toBe(true)
  expect(f.waiting.map(job => job.collectionRetry?.attempts)).toEqual([1, 2])
},20_000)

it.each([404, 408, 409, 425, 429, 500, 502, 503, 504, 'timeout', 'network'])('automatically recovers temporary query error %s without estimate or submit', async status => {
  const f = await fixture()
  f.setQuery(async index => {
    if (index !== 1) return json(f.reply())
    if (status === 'timeout') throw new DOMException('fixture timeout', 'TimeoutError')
    if (status === 'network') throw new TypeError('fixture network')
    return json({}, status as number)
  })
  await expectOriginal(f, await f.ledger.refresh(f.scope, f.job.id))
  expect(f.sleeps).toEqual([2000]); expect(f.counts().queries).toBe(2)
},20_000)

it.each(['first', 'later'])('recovers temporary HTTP errors in the %s range without misclassifying them as invalid ranges', async phase => {
  const f = await fixture(); let failed = false
  const original = async (headers: Headers) => {
    const [, startText, endText] = /^bytes=(\d+)-(\d+)$/.exec(headers.get('range')!)!
    const start = Number(startText), end = Math.min(Number(endText), video.length - 1)
    if (!failed && (phase === 'first' ? start === 0 : start > 0)) { failed = true; return json({}, 503, { 'retry-after': '3' }) }
    return new Response(video.subarray(start, end + 1), { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${video.length}` } })
  }
  f.setDownload(original)
  await expectOriginal(f, await f.ledger.refresh(f.scope, f.job.id))
  expect(f.sleeps).toEqual([3000]); expect(f.counts().queries).toBe(2)
  expect(f.waiting[0]?.collectionRetry?.reason).toBe('temporary-error')
},20_000)

it.each(['queued', 'running', 'processing', 'preparing_assets', 'unknown', 'empty', 'unavailable', 'network'])('continues %s for over five minutes and 120 polls without a total deadline or a new paid request', async mode => {
  const f = await fixture(), startedAt = f.now()
  f.setQuery(async index => {
    if (index > 120) return json(f.reply())
    if (mode === 'network') throw new Error('MEDIA_DOWNLOAD_NETWORK_ERROR')
    return json(f.reply(mode === 'unavailable' ? [{ ...f.artifact, available: false }] : [], ['empty', 'unavailable'].includes(mode) ? 'completed' : mode))
  })
  await expectOriginal(f, await f.ledger.refresh(f.scope, f.job.id))
  expect(f.counts().queries).toBe(121); expect(f.now() - startedAt).toBeGreaterThan(5 * 60_000)
  expect(f.waiting).toHaveLength(120); expect(f.waiting.at(-1)?.collectionRetry?.attempts).toBe(120)
  expect(f.waiting.every(job => job.collection === 'waiting' && !job.error)).toBe(true)
  expect(f.sleeps.every(ms => ms > 0 && ms <= MEDIA_COLLECTION_MAX_BACKOFF_MS)).toBe(true)
  if (['queued', 'running', 'processing', 'preparing_assets', 'unknown'].includes(mode)) expect(new Set(f.sleeps)).toEqual(new Set([MEDIA_COLLECTION_POLL_MS]))
},20_000)

it('bounds a very large Retry-After to 30 seconds and continues the same original task', async () => {
  const f = await fixture(); f.setQuery(async index => index === 1 ? json({}, 429, { 'retry-after': '99999999999' }) : json(f.reply()))
  await expectOriginal(f, await f.ledger.refresh(f.scope, f.job.id))
  expect(f.sleeps).toEqual([MEDIA_COLLECTION_MAX_BACKOFF_MS]); expect(f.counts().queries).toBe(2)
},20_000)

it('resumes a persisted future retry time and high attempt count after Host restart and discards obsolete deadlines', async () => {
  const f = await fixture(), value = await f.read(), startedAt = f.now()
  value.job.state = 'completed'; value.job.collection = 'waiting'
  value.job.collectionRetry = { attempts: Number.MAX_SAFE_INTEGER, startedAt: startedAt - 60 * 60_000, deadlineAt: startedAt - 55 * 60_000, nextAttemptAt: startedAt + 30_000, reason: 'result-not-ready' }
  await f.save(value); f.setQuery(async index => json(f.reply(index === 1 ? [] : undefined)))
  await expectOriginal(f, await f.make().refresh(f.scope, f.job.id, { automatic: true }))
  expect(f.sleeps).toEqual([30_000, 2000]); expect(f.counts().queries).toBe(2)
  expect(f.waiting[0]?.collectionRetry).toMatchObject({ attempts: Number.MAX_SAFE_INTEGER, nextAttemptAt: startedAt + 30_000 })
  expect(f.waiting.every(job => !('deadlineAt' in job.collectionRetry!))).toBe(true)
},20_000)

it('pauses retry sleep immediately, merges concurrent collectors and keeps a new session responsive without late writes', async () => {
  const f = await fixture(); f.setQuery(async () => json(f.reply([]))); f.setSleep(async () => new Promise(() => {}))
  const operation = f.ledger.refresh(f.scope, f.job.id), stopped = expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(async () => expect((await f.read()).job.collection).toBe('waiting'))
  for (let index = 0; index < 3; index++) expect((await f.ledger.refresh(f.scope, f.job.id, { background: true, automatic: true })).collection).toBe('waiting')
  expect(f.counts().queries).toBe(1)
  const next = await f.ledger.prepare({ ...f.scope, sessionId: 'new-session' }, { kind: 'video', prompt: '独立新会话' })
  expect(next.sessionId).toBe('new-session')
  expect((await f.ledger.pause(f.scope, f.job.id)).collection).toBe('paused'); await stopped
  expect((await f.ledger.refresh(f.scope, f.job.id, { automatic: true })).collection).toBe('paused')
  expect(f.counts().queries).toBe(1)
  f.setSleep(undefined); f.setQuery(async () => json(f.reply()))
  await expectOriginal(f, await f.ledger.refresh(f.scope, f.job.id))
},20_000)

it.each(['failed', 'cancelled', 'manual_review'])('stops automatic collection on provider terminal state %s', async state => {
  const f = await fixture(); f.setQuery(async () => json(f.reply([], state)))
  expect((await f.ledger.refresh(f.scope, f.job.id)).state).toBe(state)
  await f.ledger.refresh(f.scope, f.job.id, { automatic: true })
  expect(f.counts().queries).toBe(1); expect(f.counts().downloads).toBe(0); expect(f.sleeps).toEqual([])
  expect(f.counts()).toMatchObject(f.paidCounts)
},20_000)

it.each([400, 401, 403, 410, 422])('fails local collection immediately for permanent HTTP %s and preserves the original task', async status => {
  const f = await fixture(); f.setQuery(async () => json({}, status))
  await expect(f.ledger.refresh(f.scope, f.job.id)).rejects.toThrow(`MEDIA_HTTP_${status}`)
  expect((await f.read()).job).toMatchObject({ state: 'queued', collection: 'failed', requestId: f.job.requestId, selection: f.selection })
  expect(f.counts().queries).toBe(1); expect(f.sleeps).toEqual([]); expect(f.counts()).toMatchObject(f.paidCounts)
},20_000)

it('retains partial original files while unavailable artifacts wait, skips their saved bytes and preserves their hashes', async () => {
  const f = await fixture()
  f.setQuery(async index => json(f.reply(index === 1 ? [f.artifact, { key: 'later', available: false }] : [f.artifact])))
  await expectOriginal(f, await f.ledger.refresh(f.scope, f.job.id))
  expect(f.waiting[0]?.assets).toHaveLength(1); expect(f.counts().downloads).toBe(3)
  expect(f.waiting[0]?.assets[0]?.sha256).toBe(digest(video))
},20_000)

it('starts a default Host collector after submission and polls running tasks to completion with no UI/status calls', async () => {
  const f = await fixture(true)
  await vi.waitFor(async () => expect((await f.read()).job.collection).toBe('ready'), { timeout: 5000 })
  await expectOriginal(f, (await f.read()).job)
  expect(f.counts().queries).toBe(3); expect(f.sleeps).toEqual([5000, 5000])
},20_000)

it('restores waiting work without UI, respects its future retry timestamp, and never revives a persisted manual stop', async () => {
  const f = await fixture(), value = await f.read(), nextAttemptAt = f.now() + 25_000
  value.job.collection = 'waiting'; value.job.collectionRetry = { attempts: 1000, startedAt: f.now() - 3_600_000, nextAttemptAt }
  await f.save(value)
  let release!: () => void
  f.setSleep(async ms => { await new Promise<void>(resolve => { release = resolve }); f.advance(ms) })
  const restored = f.make(); await restored.resumePending()
  await vi.waitFor(() => expect(f.sleeps).toEqual([25_000]))
  expect(f.counts().queries).toBe(0)
  expect((await restored.pause(f.scope, f.job.id)).collection).toBe('paused')
  release(); await restored.dispose()
  await f.make().resumePending()
  expect((await f.read()).job.collection).toBe('paused'); expect(f.counts().queries).toBe(0)
},20_000)

it('disposes a hanging old Host worker before a replacement instance can update the same journal', async () => {
  const f = await fixture(); let release!: (response: Response) => void
  f.setQuery(async () => new Promise<Response>(resolve => { release = resolve }))
  const operation = f.ledger.refresh(f.scope, f.job.id), aborted = expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(f.counts().queries).toBe(1))
  await f.ledger.dispose(); await aborted
  const replacement = f.make(); await replacement.pause(f.scope, f.job.id)
  release(json(f.reply())); await new Promise(resolve => setImmediate(resolve))
  expect((await f.read()).job.collection).toBe('paused')
  await replacement.resumePending(); expect(f.counts().queries).toBe(1)
  await expect(f.ledger.refresh(f.scope, f.job.id)).rejects.toThrow('MEDIA_COLLECTOR_DISPOSED')
},20_000)

it('accepts a ready artifacts list alongside empty data and stops on explicit provider errors without exposing their text', async () => {
  const f = await fixture(); f.setQuery(async () => json({ ...f.reply(), data: [] }))
  await expectOriginal(f, await f.ledger.refresh(f.scope, f.job.id))
  expect(f.counts().queries).toBe(1); expect(f.sleeps).toEqual([])
  f.setQuery(async () => json({ ...f.reply([], 'unknown'), error: { message: 'private-provider-error-text' } }))
  await expect(f.ledger.refresh(f.scope, f.job.id)).rejects.toThrow('MEDIA_PROVIDER_REPORTED_ERROR')
  expect((await f.read()).job.collection).toBe('failed')
  expect(JSON.stringify((await f.read()).job)).not.toContain('private-provider-error-text')
},20_000)

it('retains original video progress and only per-request deadlines beyond 120 seconds of task time', async () => {
  const f = await fixture(), startedAt = f.now(), ranges: string[] = []
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  f.advance(60_000)
  f.setDownload(async headers => {
    ranges.push(headers.get('range')!)
    const [, from, to] = /^bytes=(\d+)-(\d+)$/.exec(headers.get('range')!)!
    const start = Number(from), end = Math.min(Number(to), video.length - 1)
    f.advance(25_000)
    return new Response(video.subarray(start, end + 1), { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${video.length}` } })
  })
  await expectOriginal(f, await f.ledger.refresh(f.scope, f.job.id))
  expect(f.now() - startedAt).toBe(135_000)
  expect(f.counts().queries).toBe(1); expect(ranges).toHaveLength(3)
  expect(ranges.filter(range => range === 'bytes=0-1048575')).toHaveLength(1)
  // Ledger query + service query + three independent range requests.
  expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([30_000, 30_000, 30_000, 30_000, 30_000])
},20_000)

it('cannot start a worker after disposal while transfer setup is awaiting ownership', async () => {
  const f = await fixture(); let release!: (owner: string) => void
  f.setOwner(async () => new Promise<string>(resolve => { release = resolve }))
  const operation = f.ledger.refresh(f.scope, f.job.id), rejected = expect(operation).rejects.toThrow('MEDIA_COLLECTOR_DISPOSED')
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  await f.ledger.dispose(); f.setOwner(async () => 'fixture-owner'); release('fixture-owner'); await rejected
  expect(f.counts().queries).toBe(0)
  expect((await f.read()).job.collection).toBeUndefined()
},20_000)

it('keeps a paid submit response in credential-bound history but prevents disposed submission workers overwriting replacement journals', async () => {
  const f = await fixture(); let release!: (response: Response) => void
  f.setSubmit(async () => new Promise<Response>(resolve => { release = resolve }))
  const pending = await f.ledger.prepare(f.scope, { kind: 'video', prompt: '另一个已授权任务', selection: f.selection })
  await f.ledger.submitRequested(f.scope, pending.id, pending.revision)
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  await f.ledger.dispose()
  const replacement = f.make(); await replacement.pause(f.scope, pending.id)
  release(json(f.reply([], 'queued'), 202))
  await vi.waitFor(async () => expect((await f.service.list()).find(task => task.requestId === pending.requestId)?.taskId).toBe(f.taskId))
  const journal = JSON.parse(await readFile(join(f.root, pending.id + '.json'), 'utf8'))
  expect(journal.job.collection).toBe('paused'); expect(journal.submitted).toBe(true)
  expect(f.counts().submits).toBe(2); expect(f.counts().queries).toBe(0)
},20_000)
