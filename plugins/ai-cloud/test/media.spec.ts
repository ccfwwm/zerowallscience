import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { AiCloudMediaService } from '../src/host/media.js'
import type { AiCloudAccountSnapshot, AiCloudMediaModel } from '@zerowallscience/plugin-account/types'
import type { MediaRequest } from '../src/shared/media.js'
import { publicIPv4 } from '../src/host/artifact-network.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const wav = Buffer.alloc(46); wav.write('RIFF'); wav.writeUInt32LE(38,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(2,40)
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status })
function model(operation = 'image'): AiCloudMediaModel {
  return { providerId: 'zerowall-ai-cloud-7', groupId: '7', groupName: '图片音频视频分组', baseUrl: 'https://hkcode.aicodeme.xyz/v1', modelId: 'fixture-model', capability: 'media', profileId: 'opaque', version: '1', mediaType: operation === 'video' ? 'video' : operation === 'chat_music' ? 'audio' : 'image', operations: [operation], sizes: ['1024x1024'], qualities: ['medium'], resolutions: ['1K'], aspectRatios: ['1:1'], duration: {}, materials: { image: { max_count: 1, max_file_bytes: 4096, formats: ['data_url', 'file'] } }, formats: [], pollSeconds: 1, maxRequestBytes: 100_000 }
}
const request = (operation = 'image'): MediaRequest => ({ requestId: 'request-fixture-0001', modelId: 'fixture-model', profileId: 'opaque', groupId: '7', operation, prompt: 'tiny fixture', async: true })
async function setup(fetcher: typeof fetch, operation = 'image') {
  const values = new Map([['zerowall.ai-cloud.group.7', 'private-fixture-key']])
  const secrets = { get: async (k: string) => values.get(k), set: async (k: string, v: string) => { values.set(k, v) }, delete: async (k: string) => { values.delete(k) } }
  let state: AiCloudAccountSnapshot = { status: 'signedIn', email: 'fixture@example.test', gatewayBaseUrl: 'https://hkcode.aicodeme.xyz', balanceFreshness: 'current', lowBalance: false, models: [], mediaModels: [model(operation)], mediaSync: { status: 'succeeded', checkedAt: 'now', groups: [{ groupId: '7', groupName: '媒体', checkedAt: 'now', status: 'succeeded', count: 1 }] } }
  const account = { current: async () => state, discoverModels: async () => state }
  const cacheDir = await mkdtemp(join(tmpdir(), 'zws-media-')); roots.push(cacheDir)
  const make = () => new AiCloudMediaService(account, secrets, { fetch: fetcher, cacheDir })
  return { service: make(), make, values, state, cacheDir, setState: (next: AiCloudAccountSnapshot) => { state = next } }
}

it('keeps a durable 202 task and restores/downloads it with the original key without another POST', async () => {
  const bytes = png
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input); const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer private-fixture-key'); expect(init?.redirect).toBe('error')
    if (url.endsWith('/images/generations')) { expect(headers.get('Idempotency-Key')).toBe(request().requestId); return json({ id: 'mt_fixture', model: 'fixture-model', status: 'queued', data: [] }, 202) }
    if (url.endsWith('/v1/tasks/mt_fixture')) return json({ id: 'mt_fixture', model: 'fixture-model', status: 'completed', data: [{ key: 'image_0', mime_type: 'image/png', content_url: '/v1/tasks/mt_fixture/artifacts/image_0/content' }] })
    return new Response(bytes)
  })
  const { service, make } = await setup(fetcher)
  expect((await service.submit(request())).status).toBe('queued')
  const restored = make(); const task = await restored.wait(request().requestId, 1)
  expect(task.status).toBe('completed'); expect(JSON.stringify(task)).not.toContain('private-fixture-key'); expect(JSON.stringify(task)).not.toContain('content_url')
  const output = await restored.download(task.requestId, 'image_0')
  expect(output.bytes).toEqual(bytes); expect(output.sha256).toMatch(/^[a-f0-9]{64}$/)
  await restored.submit(request())
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

it('restores an in_progress platform task without resubmitting or rejecting its response', async () => {
  const fetcher = vi.fn<typeof fetch>(async (_, init) => init?.method === 'POST'
    ? json({ id: 'mt_platform', model: 'fixture-model', status: 'queued' }, 202)
    : json({ id: 'mt_platform', model: 'fixture-model', status: 'in_progress' }))
  const { service, make } = await setup(fetcher, 'video')
  await service.submit(request('video'))
  expect((await make().query(request('video').requestId)).status).toBe('running')
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

it.each(['array', 'single', 'url_object', 'native_content'])('uses the configured %s video reference shape and original task on resume', async shape => {
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)); expect(body.seconds).toBe(5); expect(body.public_profile_id).toBe('opaque')
      if (shape === 'native_content') expect(body.metadata.content[0]).toMatchObject({type:'image_url',role:'reference_image'})
      else if (shape === 'url_object') expect(body.image.url).toContain('data:image/png;')
      else if (shape === 'single') expect(typeof body.image).toBe('string')
      else expect(body.images).toHaveLength(1)
      return json({id:'mt_video',model:'fixture-model',status:'queued'},202)
    }
    return json({id:'mt_video',model:'fixture-model',status:'unknown'})
  })
  const {service,state,make}=await setup(fetcher,'video')
  Object.assign(state.mediaModels![0]!,{referenceShape:shape,referenceField:shape==='array'?'images':'image',duration:{mode:'enum',values:[5],required:true}})
  if (shape==='url_object'||shape==='native_content') state.mediaModels![0]!.materials.image!.formats=['data_url_in_url_object']
  await service.submit({...request('video'),parameters:{duration:5},references:[{mediaType:'image/png',base64:png.toString('base64')}]})
  expect((await make().wait(request().requestId,1)).status).toBe('unknown')
  expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
})

it('rejects unsupported duration, mask and reference bytes before estimating or submitting', async () => {
  const fetcher=vi.fn<typeof fetch>(); const {service,state}=await setup(fetcher,'video')
  state.mediaModels![0]!.duration={mode:'enum',values:[5],required:true}
  await expect(service.estimate(request('video'))).rejects.toThrow('MEDIA_DURATION_REQUIRED')
  await expect(service.submit({...request('video'),parameters:{duration:8}})).rejects.toThrow('MEDIA_UNSUPPORTED_DURATION')
  await expect(service.submit({...request('video'),parameters:{duration:5},references:[{mediaType:'image/png',base64:Buffer.from('not png').toString('base64')}]})).rejects.toThrow('MEDIA_UNRECOGNIZED_ARTIFACT_FORMAT')
  expect(fetcher).not.toHaveBeenCalled()
})

it('classifies definitive rejection and preserves corrupted journal without submitting', async () => {
  const fetcher=vi.fn<typeof fetch>(async()=>json({},422));const {service,values}=await setup(fetcher)
  await expect(service.submit(request())).rejects.toThrow('MEDIA_HTTP_422')
  expect((await service.list())[0]!.status).toBe('rejected')
  values.set('zerowall.ai-cloud.media-journal.v1','{"damaged":true}')
  await expect(service.submit(request())).rejects.toThrow('MEDIA_JOURNAL_INVALID')
  expect(fetcher).toHaveBeenCalledOnce();expect(values.get('zerowall.ai-cloud.media-journal.v1')).toBe('{"damaged":true}')
})

it.each(['https://127.0.0.1/x','https://localhost/x','https://user:pass@media.example.test/x','http://media.example.test/x','https://hkcode.aicodeme.xyz/private'])('rejects unsafe result location %s', async url => {
  const {service}=await setup(vi.fn<typeof fetch>(async()=>json({data:[{url}]})))
  await expect(service.submit(request())).rejects.toThrow('MEDIA_SUBMISSION_UNCERTAIN')
})

it('rejects a wrong task identity and corrupted local result', async () => {
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(json({id:'mt_expected',model:'fixture-model',status:'queued'},202)).mockResolvedValueOnce(json({id:'mt_other',model:'fixture-model',status:'completed'}))
  const first=await setup(fetcher);await first.service.submit(request());await expect(first.service.query(request().requestId)).rejects.toThrow('MEDIA_TASK_IDENTITY_MISMATCH')
  const second=await setup(vi.fn<typeof fetch>(async()=>json({data:[{b64_json:png.toString('base64')}]})))
  await second.service.submit(request()); const file=(await readdir(second.cacheDir))[0]!
  await writeFile(join(second.cacheDir,file),'corrupted')
  await expect(second.service.download(request().requestId,'0')).rejects.toThrow('MEDIA_CACHE_HASH_MISMATCH')
})

it('denies private, reserved and malformed IPv4 before a pinned artifact connection',()=>{
  for(const value of ['127.0.0.1','10.1.1.1','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1','198.18.0.1','0.0.0.0','224.1.1.1','1.2.3.999','::1'])expect(publicIPv4(value)).toBe(false)
  expect(publicIPv4('8.8.8.8')).toBe(true)
})

it('repairs cached provider MIME hints on recovery without downloading or submitting again',async()=>{
 const f=await setup(vi.fn<typeof fetch>(async()=>json({data:[{b64_json:wav.toString('base64'),mime_type:'audio/wav'}]})),'chat_music')
 await f.service.submit(request('chat_music'))
 const journal=JSON.parse(f.values.get('zerowall.ai-cloud.media-journal.v1')!)
 journal[0].artifacts[0].mediaType='audio/mpeg';delete journal[0].artifacts[0].duration
 f.values.set('zerowall.ai-cloud.media-journal.v1',JSON.stringify(journal))
 const recovered=await f.make().download(request().requestId,'0')
 expect(recovered.mediaType).toBe('audio/wav');expect(recovered.duration).toBeGreaterThan(0)
 expect(JSON.parse(f.values.get('zerowall.ai-cloud.media-journal.v1')!)[0].artifacts[0].mediaType).toBe('audio/wav')
})

it('replays uncertain submission only with the same idempotency key and rejects changed parameters', async () => {
  const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('private-fixture-key')).mockResolvedValueOnce(json({ data: [{ b64_json: png.toString('base64') }] }))
  const { service, make } = await setup(fetcher)
  await expect(service.submit(request())).rejects.toThrow('MEDIA_SUBMISSION_UNCERTAIN')
  await expect(make().submit({ ...request(), prompt: 'different' })).rejects.toThrow('MEDIA_IDEMPOTENCY_CONFLICT')
  const resumed = await make().submit(request()); expect(resumed.status).toBe('completed')
  expect(fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))).toEqual([request().requestId, request().requestId])
})

it.each(['gemini_image', 'chat_music'])('decodes synchronous %s and uses the matching protocol', async operation => {
  const bytes = operation === 'chat_music' ? wav : png
  const encoded = bytes.toString('base64')
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const payload = JSON.parse(String(init?.body))
    if (operation === 'gemini_image') { expect(String(url)).toContain(':generateContent'); expect(payload.contents[0].parts[0].text).toBe(request().prompt); return json({ candidates: [{ content: { parts: [{ inlineData: { data: encoded, mimeType: 'image/png' } }] } }] }) }
    expect(String(url)).toContain('/chat/completions'); expect(payload.messages[0].content).toBe(request().prompt)
    return json({ id: 'chatcmpl-synchronous-fixture', choices: [{ message: { audio: { data: encoded } } }] })
  })
  const { service } = await setup(fetcher, operation)
  const task = await service.submit(request(operation)); expect(task.status).toBe('completed'); expect(task.artifacts).toHaveLength(1)
  expect((await service.download(task.requestId, task.artifacts[0]!.key)).bytes).toEqual(bytes)
})

it('blocks stale selections, invalid bounds, account changes and a changed original key before paid/network work', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json({ data: [{ b64_json: png.toString('base64') }] }))
  const { service, state, setState, values } = await setup(fetcher)
  await expect(service.submit({ ...request(), parameters: { size: 'unsupported' } })).rejects.toThrow('MEDIA_UNSUPPORTED_PARAMETER')
  await expect(service.submit({ ...request(), profileId: 'removed' })).rejects.toThrow('MEDIA_SELECTION_INVALID')
  expect(fetcher).not.toHaveBeenCalled()
  await service.submit(request()); values.set('zerowall.ai-cloud.group.7', 'other-key')
  await expect(service.download(request().requestId, '0')).rejects.toThrow('MEDIA_TASK_ACCOUNT_MISMATCH')
  setState({ ...state, status: 'signedOut' }); expect(await service.list()).toEqual([])
})

it('previews costs without submitting media and never sends authorization to external artifact hosts', async () => {
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/estimates')) return json({ currency: 'USD', maximum_charge: '0.1', calculation: { total: '0.02' } })
    if (String(url).endsWith('/generations')) return json({ data: [{ url: 'https://media.example.test/image.png' }] })
    expect(new Headers(init?.headers).get('authorization')).toBeNull(); expect(init?.redirect).toBe('error'); return new Response(png)
  })
  const { service } = await setup(fetcher)
  expect(await service.estimate(request())).toEqual({ currency: 'USD', maximumCharge: '0.1', total: '0.02' })
  expect(fetcher).toHaveBeenCalledOnce()
  const task = await service.submit(request()); await service.download(task.requestId, '0')
})
