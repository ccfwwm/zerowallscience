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

it.each(['v6k_url', 'yunfei_multimodal'])('forwards the complete website manifest and future options with %s despite stale catalog limits', async format => {
  const calls: any[] = []
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    calls.push(JSON.parse(String(init?.body)))
    return String(url).endsWith('/estimates') ? json({currency:'USD',maximum_charge:'0.1'}) : json({id:'mt_five_refs',status:'queued'},202)
  })
  const {service,state} = await setup(fetcher,'video')
  Object.assign(state.mediaModels![0]!, {requestFormat:format,materials:{image:{max_count:1,max_file_bytes:1}},duration:{mode:'enum',values:[15]}})
  const base='https://zerowall.chengxunkeji.cn/webfiles/'
  const images=['zerowall-icon.png','01-medical-research-workspace.png','02-singlecell-virtual-knockout.png','03-genetics-brand-finale.png'].map(name=>({url:base+name,role:'reference',provider_weight:0.7}))
  const videos=[{url:base+'zerowallsciencevideo.mp4',provider_motion:'preserve'}]
  const input={...request('video'),parameters:{duration:5,quality:'future-quality',future_options:{preserve:true},images,videos}}
  await service.estimate(input);const task=await service.submit(input)
  expect(calls[0].request).toEqual(calls[1])
  expect(calls[1].images).toEqual(images)
  expect(calls[1].videos).toEqual(videos)
  expect(calls[1]).toMatchObject({future_options:{preserve:true},quality:'future-quality'})
  expect(task.diagnostics).toMatchObject({stage:'accepted',references:{image:4,video:1,audio:0}})
  await expect(service.estimate({...input,references:[{url:base+'different.png',mediaType:'image/png'}]})).rejects.toThrow('INPUT_CONFLICT')
  await expect(service.estimate({...input,parameters:{...input.parameters,model:'replacement'}})).rejects.toThrow('RESERVED_PARAMETER')
})

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
  expect(task.status).toBe('completed'); expect(JSON.stringify(task)).not.toContain('private-fixture-key'); expect(JSON.stringify(task.artifacts)).not.toContain('content_url')
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

it.each(['array', 'single', 'url_object', 'native_content'])('keeps canonical input independent of the legacy %s catalog hint on resume', async shape => {
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)); expect(body.seconds).toBe(5); expect(body.public_profile_id).toBe('opaque')
      expect(body.images).toEqual([`data:image/png;base64,${png.toString('base64')}`])
      expect(body.image).toBeUndefined();expect(body.metadata).toBeUndefined()
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
  await expect(service.submit({...request('video'),parameters:{duration:-1}})).rejects.toThrow('MEDIA_UNSUPPORTED_DURATION')
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
    if (operation === 'gemini_image') { expect(String(url)).toContain(':generateContent'); expect(payload.prompt).toBe(request().prompt); expect(payload.contents).toBeUndefined(); return json({ candidates: [{ content: { parts: [{ inlineData: { data: encoded, mimeType: 'image/png' } }] } }] }) }
    expect(String(url)).toContain('/chat/completions'); expect(payload.prompt).toBe(request().prompt); expect(payload.messages).toBeUndefined()
    return json({ id: 'chatcmpl-synchronous-fixture', choices: [{ message: { audio: { data: encoded } } }] })
  })
  const { service } = await setup(fetcher, operation)
  const task = await service.submit(request(operation)); expect(task.status).toBe('completed'); expect(task.artifacts).toHaveLength(1)
  expect((await service.download(task.requestId, task.artifacts[0]!.key)).bytes).toEqual(bytes)
})

it('blocks stale selections, invalid bounds, account changes and a changed original key before paid/network work', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json({ data: [{ b64_json: png.toString('base64') }] }))
  const { service, state, setState, values } = await setup(fetcher)
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


it('uses canonical mixed references for identical estimate and submit contracts regardless of catalog hints', async () => {
 const calls: any[]=[]
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{calls.push(JSON.parse(String(init?.body)));return String(url).endsWith('/estimates')?json({currency:'USD',maximum_charge:'0.01'}):json({id:'mt_mixed',model:'fixture-model',status:'queued'},202)})
 const {service,state}=await setup(fetcher,'video')
 Object.assign(state.mediaModels![0]!,{requestFormat:'yunfei_multimodal',duration:{mode:'enum',values:[5]},materials:Object.fromEntries(['image','video','audio'].map(k=>[k,{max_count:3,max_file_bytes:4096,formats:['data_url','data_url_in_url_object','public_url_string'],max_duration_seconds:'30'}]))})
 const input:MediaRequest={...request('video'),parameters:{duration:5,aspect_ratio:'1:1'},references:[{mediaType:'image/png',base64:png.toString('base64')},{mediaType:'audio/wav',base64:wav.toString('base64')},{mediaType:'video/mp4',url:'https://media.example.com/motion.mp4'}]}
 await service.estimate(input);await service.submit(input)
 expect(calls[0].request).toEqual(calls[1]);expect(calls[1]).toMatchObject({seconds:5,ratio:'1:1',images:[expect.stringContaining('data:image/png;base64,')],audios:[expect.stringContaining('data:audio/wav;base64,')],videos:['https://media.example.com/motion.mp4']})
 expect(calls[1].duration).toBeUndefined();expect(calls[1].reference_images).toBeUndefined()
})

it('preserves Yunfei frame order and blocks mixed, duplicate, or non-image frame roles', async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>json({currency:'USD',maximum_charge:'0'}));const {service,state}=await setup(fetcher,'video')
 Object.assign(state.mediaModels![0]!,{requestFormat:'yunfei_multimodal',materials:{image:{max_count:3,max_file_bytes:4096,formats:['data_url_in_url_object','data_url']}}})
 const frames=[{mediaType:'image/png',base64:png.toString('base64'),role:'first_frame'},{mediaType:'image/png',base64:png.toString('base64'),role:'last_frame'}]
 await service.estimate({...request('video'),references:frames})
 expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).request.images.map((r:any)=>r.role)).toEqual(['first_frame','last_frame'])
 for(const refs of [[...frames,{...frames[0]!,role:'reference'}],[frames[0]!,frames[0]!],[{...frames[0]!,mediaType:'audio/wav'}]])await expect(service.estimate({...request('video'),references:refs})).rejects.toThrow(/MEDIA_(FRAME_REFERENCE_CONFLICT|REFERENCE_ROLE_UNSUPPORTED)/)
 expect(fetcher).toHaveBeenCalledTimes(1)
})

it('sends canonical URLs and encoded inputs independently of the legacy catalog format',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>json({id:'mt_v6k',model:'fixture-model',status:'queued'},202));const {service,state}=await setup(fetcher,'video')
 Object.assign(state.mediaModels![0]!,{requestFormat:'v6k_url',materials:{image:{max_count:2,max_file_bytes:4096,formats:['public_url_object']},video:{max_count:1,max_file_bytes:4096,formats:['public_url_object']}}})
 await service.submit({...request('video'),parameters:{duration:30,aspect_ratio:'1:1'},references:[{mediaType:'image/png',url:'https://media.example.com/ref.png?signature=private'}]})
 const body=JSON.parse(String(fetcher.mock.calls[0]![1]!.body));expect(body).toMatchObject({seconds:30,ratio:'1:1',images:['https://media.example.com/ref.png?signature=private']});expect(body.duration).toBeUndefined();expect(body.aspect_ratio).toBeUndefined()
 await service.estimate({...request('video'),references:[{mediaType:'image/png',base64:png.toString('base64')}]})
 expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body)).request.images).toEqual([`data:image/png;base64,${png.toString('base64')}`])
 await service.estimate({...request('video'),references:[{mediaType:'video/mp4',url:'https://media.example.com/ref.mp4'}]})
 expect(JSON.parse(String(fetcher.mock.calls[2]![1]!.body)).request.videos).toEqual(['https://media.example.com/ref.mp4'])
 expect(fetcher).toHaveBeenCalledTimes(3)
})

it.each(['string','url','b64_json'])('normalizes %s Data URL aliases into the same gateway payload',async shape=>{
 const calls:any[]=[];const fetcher=vi.fn<typeof fetch>(async(_,init)=>{calls.push(JSON.parse(String(init?.body)));return calls.length===1?json({currency:'USD',maximum_charge:'0.1'}):json({id:'mt_encoded',status:'queued'},202)})
 const {service,state}=await setup(fetcher,'video');Object.assign(state.mediaModels![0]!,{requestFormat:'v6k_url',materials:{image:{formats:['public_url_object'],max_count:1}}})
 const image=`data:image/png;base64,${png.toString('base64')}`,audio=`data:audio/wav;base64,${wav.toString('base64')}`
 const wrap=(v:string)=>shape==='string'?v:{[shape]:v}
 const input={...request('video'),parameters:{seconds:5,images:[wrap(image),wrap(image),wrap(image),wrap(image)],audios:[wrap(audio)]}}
 await service.estimate(input);await service.submit(input)
 expect(calls[0].request).toEqual(calls[1]);expect(calls[1]).toMatchObject({seconds:5,images:[image,image,image,image],audios:[audio]})
 expect(calls[1].reference_images).toBeUndefined();expect(calls[1].reference_audios).toBeUndefined()
})

it('bounds encoded request size during estimate and does not leak reference rejection bodies', async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>json({error:{code:'unsupported_reference_format',message:'secret-base64-provider-body'}},400));const {service,state}=await setup(fetcher,'video')
 Object.assign(state.mediaModels![0]!,{requestFormat:'yunfei_multimodal',maxRequestBytes:100})
 await expect(service.estimate({...request('video'),references:[{mediaType:'image/png',base64:png.toString('base64')}]})).rejects.toThrow('MEDIA_REQUEST_TOO_LARGE');expect(fetcher).not.toHaveBeenCalled()
 state.mediaModels![0]!.maxRequestBytes=100000
 await expect(service.submit(request('video'))).rejects.toMatchObject({rejected:true,message:expect.stringContaining('MEDIA_REFERENCE_URL_REQUIRED')})
 expect((await service.list())[0]!.status).toBe('rejected')
 await expect(service.submit(request('video'))).rejects.toThrow('MEDIA_REQUEST_REJECTED');expect(fetcher).toHaveBeenCalledTimes(1)
})

it('preserves an asynchronous unaccepted format rejection across restart', async () => {
 const fetcher = vi.fn<typeof fetch>(async (_, init) => init?.method === 'POST' ? json({id:'mt_reject',model:'fixture-model',status:'queued'},202) : json({id:'mt_reject',model:'fixture-model',status:'failed',diagnostic:'reference_url_required',data:[]}))
 const f=await setup(fetcher,'video');await f.service.submit(request('video'))
 expect((await f.make().query(request().requestId)).status).toBe('rejected')
 await expect(f.make().submit(request('video'))).rejects.toThrow('MEDIA_REQUEST_REJECTED')
 expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
})

it.each(['auth_failed','insufficient_balance','content_rejected','rate_limit'])('does not reinterpret asynchronous %s as a reference rejection', async diagnostic => {
 const fetcher=vi.fn<typeof fetch>(async(_,init)=>json({id:'mt_reject',model:'fixture-model',status:init?.method==='POST'?'queued':'failed',diagnostic}))
 const f=await setup(fetcher,'video');await f.service.submit(request('video'))
 expect((await f.service.query(request().requestId)).status).toBe('failed')
})


it('keeps malformed replies attempted and sanitizes accepted upstream failure evidence', async () => {
  let reply: any = { status: 'queued' }
  const { service } = await setup(vi.fn(async () => json(reply)), 'video')
  await expect(service.submit(request('video'))).rejects.toThrow('SUBMISSION_UNCERTAIN')
  expect((await service.list())[0]?.diagnostics?.stage).toBe('attempted')
  reply = { id:'mt_rejected', model:'fixture-model', status:'failed', diagnostic:'UPSTREAM_REF_LIMIT: Bearer private-fixture-key', inputs:{stage:'attempted',references:{image:1}}, submission:{stage:'attempted',request:{future_token:'secret',images:[{url:'https://u:p@media.example.com/a.png?sig=secret'}]}} }
  const result = await service.submit({...request('video'),requestId:'request-failure-0002'})
  expect(result.error).toContain('UPSTREAM_REF_LIMIT')
  expect(result.diagnostics?.upstream).toMatchObject({stage:'attempted',references:{image:1}})
  expect(result.diagnostics?.response).not.toHaveProperty('submission')
  expect(JSON.stringify(result)).not.toMatch(/private-fixture-key|sig=secret|u:p@/)
})
