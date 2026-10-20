import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { AccountSecretStore } from '@zerowallscience/plugin-account'
import type { AiCloudAccountSnapshot, AiCloudMediaModel } from '@zerowallscience/plugin-account/types'
import { isImageGenerationGroup, uniqueMediaModels } from '@zerowallscience/plugin-account'
import type { MediaArtifact, MediaCatalog, MediaDiagnostics, MediaRequest, MediaSelection, MediaTask, ZeroWallMedia } from '../shared/media.js'
import { safeMediaValue, safeMediaResponse } from './media-diagnostics.js'
import { artifactFormat } from './artifact-format.js'
import { externalArtifact } from './artifact-network.js'
import { downloadImageBytes } from './image-download.js'
import { downloadMediaBytes } from './media-download.js'
import { mediaAbortable } from './media-abort.js'
import { mediaHttpError } from './media-retry.js'
import { referenceBytes, referenceValue, referenceProperties, normalizeMediaReferences, validateFrameReferences, MAX_MEDIA_REQUEST_BYTES } from './media-reference.js'

interface Account { current(): Promise<AiCloudAccountSnapshot>; discoverModels(): Promise<AiCloudAccountSnapshot> }
interface StoredArtifact extends MediaArtifact { source?: string; file?: string }
interface StoredTask extends MediaTask { keyHash: string; artifacts: StoredArtifact[] }
const JOURNAL = 'zerowall.ai-cloud.media-journal.v1'
const MAX_BYTES = 256 * 1024 * 1024
const TRUSTED = ['hkcode.aicodeme.xyz', 'code.aicodeme.xyz', 'code.aicodeme.cn']
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, canonical(v)]))
  return value
}
function gateway(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || !TRUSTED.includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !['', '/', '/v1'].includes(url.pathname)) throw new Error('MEDIA_UNTRUSTED_GATEWAY')
  return url.origin
}
function dto(task: StoredTask): MediaTask {
  return { requestId: task.requestId, ...(task.taskId ? { taskId: task.taskId } : {}), account: task.account, gateway: task.gateway,
    selection: { groupId: task.selection.groupId, profileId: task.selection.profileId, modelId: task.selection.modelId, operation: task.selection.operation },
    parametersHash: task.parametersHash, ...(task.diagnostics ? { diagnostics: task.diagnostics } : {}), ...(task.error ? { error: task.error } : {}), status: task.status, ...(task.artifactsPending ? { artifactsPending: true } : {}), createdAt: task.createdAt, updatedAt: task.updatedAt,
    artifacts: task.artifacts.map(a => ({ key: a.key, mediaType: a.mediaType, ...(a.bytes !== undefined ? { bytes: a.bytes } : {}), ...(a.duration !== undefined ? { duration: a.duration } : {}), ...(a.sha256 ? { sha256: a.sha256 } : {}), ...(a.revisedPrompt ? { revisedPrompt: a.revisedPrompt } : {}), ...(a.quality ? { quality: a.quality } : {}) })) }
}

/** Host-only credentials, durable task identities and bounded artifact storage. */
export class AiCloudMediaService implements ZeroWallMedia {
  private readonly fetcher: typeof fetch
  private readonly cacheDir: string
  private readonly externalFetch: typeof externalArtifact
  private readonly operations = new Map<string, Promise<MediaTask>>()
  private writes: Promise<unknown> = Promise.resolve()
  constructor(private readonly account: Account, private readonly secrets: AccountSecretStore, options: { fetch?: typeof fetch; cacheDir?: string } = {}) {
    this.fetcher = options.fetch ?? fetch
    this.cacheDir = options.cacheDir ?? join(process.env.DSH_HOME || join(homedir(), '.zerowall'), 'media')
    this.externalFetch = options.fetch ? (url, signal, headers) => options.fetch!(url, { redirect: 'error', signal, ...(headers ? { headers } : {}) }) : externalArtifact
  }

  async catalog(refresh = false): Promise<MediaCatalog> {
    const snapshot = await (refresh ? this.account.discoverModels() : this.account.current())
    if (snapshot.status !== 'signedIn') return { models: [], status: 'signedOut', error: '请登录 AI 云平台。' }
    const status = snapshot.mediaSync?.status ?? 'unavailable'
    return { models: uniqueMediaModels((snapshot.mediaModels ?? []).filter(m => isImageGenerationGroup(m.groupName))), status, ...(status === 'succeeded' ? {} : { error: '媒体能力目录不可用，请刷新账号目录。' }) }
  }

  private async resolve(input: MediaSelection): Promise<{ model: AiCloudMediaModel; key: string; snapshot: AiCloudAccountSnapshot; base: string }> {
    const snapshot = await this.account.current()
    if (snapshot.status !== 'signedIn') throw new Error('MEDIA_SIGN_IN_REQUIRED')
    const candidates = uniqueMediaModels(snapshot.mediaModels ?? []).filter(m => m.groupId === input.groupId && m.modelId === input.modelId && m.profileId === input.profileId && m.operations.includes(input.operation))
    const model = candidates.length === 1 ? candidates[0] : undefined
    if (!model || !isImageGenerationGroup(model.groupName) || model.stale || !snapshot.mediaSync?.groups.some(g => g.groupId === input.groupId && g.status === 'succeeded')) throw new Error('MEDIA_SELECTION_INVALID: 请重新选择当前目标分组中的模型。')
    const key = await this.secrets.get(`zerowall.ai-cloud.group.${model.groupId}`)
    if (!key?.trim()) throw new Error('MEDIA_CREDENTIAL_UNAVAILABLE: 请刷新账号。')
    return { model, key: key.trim(), snapshot, base: gateway(model.baseUrl) }
  }

  private validate(input: MediaRequest, model: AiCloudMediaModel): void {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(input.requestId)) throw new Error('MEDIA_INVALID_REQUEST_ID')
    if (!input.prompt?.trim() || input.prompt.length > 100_000) throw new Error('MEDIA_PROMPT_REQUIRED')
    const p = input.parameters ?? {}
    // Capability catalogs are advisory; the selected upstream validates optional values.
    if (p.duration !== undefined && (!Number.isSafeInteger(p.duration) || p.duration <= 0)) throw new Error('MEDIA_UNSUPPORTED_DURATION')
    if (p.duration === undefined && p.seconds === undefined && model.duration.required && model.duration.mode !== 'fixed') throw new Error('MEDIA_DURATION_REQUIRED')
    for (const key of ['model', 'public_profile_id', 'prompt', 'requestId']) if (p[key] !== undefined) throw new Error('MEDIA_RESERVED_PARAMETER: ' + key)
    if (p.n !== undefined && p.n !== 1) throw new Error('MEDIA_OUTPUT_COUNT_REQUIRES_ONE')
    if (p.seed !== undefined && (!Number.isSafeInteger(p.seed) || p.seed < 0)) throw new Error('MEDIA_INVALID_SEED')
    const references = input.references ?? []
    if (references.length > 16) throw new Error('MEDIA_REFERENCE_LIMIT')
    validateFrameReferences(references)
    for (const ref of [...references, ...(input.mask ? [input.mask] : [])]) {
      const bytes = referenceBytes(ref), isMask = ref === input.mask
      if (isMask && (ref.mediaType !== 'image/png' || !bytes)) throw new Error('MEDIA_INVALID_REFERENCE')
      if (input.operation !== 'video' && (!ref.mediaType.startsWith('image/') && !isMask || ref.url !== undefined)) throw new Error('MEDIA_REFERENCE_FORMAT')
    }
    if (input.mask && input.operation !== 'image_edit') throw new Error('MEDIA_MASK_UNSUPPORTED')
  }

  private wire(input: MediaRequest, model: AiCloudMediaModel): { path: string; payload: Record<string, unknown>; body: string | FormData } {
    const parameters = input.parameters ?? {}
    const payload: Record<string, unknown> = { ...parameters, model: input.modelId, public_profile_id: input.profileId, prompt: input.prompt, async: input.async ?? true }
    // Both estimates and generation use this exact documented operation shape.
    let path: string
    switch (input.operation) {
      case 'image': path = '/v1/images/generations'; break
      case 'image_edit': {
        if (!input.references?.length) throw new Error('MEDIA_EDIT_REQUIRES_REFERENCE')
        path = '/v1/images/edits'
        payload.image = input.references.map(ref => referenceValue(ref))
        if (input.mask) payload.mask = `data:${input.mask.mediaType};base64,${input.mask.base64}`
        const form = new FormData()
        for (const [key, value] of Object.entries(payload)) if (!['image', 'mask'].includes(key)) form.set(key, String(value))
        for (const ref of input.references) form.append('image[]', new Blob([Buffer.from(ref.base64!, 'base64')], { type: ref.mediaType }), ref.name ?? 'reference.png')
        if (input.mask) form.set('mask', new Blob([Buffer.from(input.mask.base64!, 'base64')], { type: input.mask.mediaType }), 'mask.png')
        return { path, payload, body: form }
      }
      case 'gemini_image':
        path = `/v1beta/models/${encodeURIComponent(input.modelId)}:generateContent`
        payload.contents = [{ role: 'user', parts: [{ text: input.prompt }, ...(input.references ?? []).map(ref => ({ inlineData: { mimeType: ref.mediaType, data: ref.base64 } }))] }]
        payload.generationConfig = { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { ...(parameters.aspect_ratio ? { aspectRatio: parameters.aspect_ratio } : {}), ...(parameters.resolution ? { imageSize: parameters.resolution } : {}) } }
        for (const field of ['prompt', 'aspect_ratio', 'resolution']) delete payload[field]
        break
      case 'video':
        path = '/v1/videos'
        if (model.requestFormat === 'yunfei_multimodal' || model.requestFormat === 'v6k_url') {
          if (model.requestFormat === 'v6k_url') {
            if (parameters.duration !== undefined) { if (payload.seconds !== undefined && payload.seconds !== parameters.duration) throw new Error('MEDIA_ALIAS_CONFLICT: duration/seconds'); payload.seconds = parameters.duration; delete payload.duration }
            if (parameters.aspect_ratio !== undefined) { if (payload.ratio !== undefined && payload.ratio !== parameters.aspect_ratio) throw new Error('MEDIA_ALIAS_CONFLICT: aspect_ratio/ratio'); payload.ratio = parameters.aspect_ratio; delete payload.aspect_ratio }
          }
          for (const kind of ['image', 'video', 'audio']) {
            const refs = (input.references ?? []).filter(ref => ref.mediaType.startsWith(kind + '/'))
            if (!refs.length) continue
            // The gateway owns provider-specific field names.
            const field = kind + 's'
            payload[field] = refs.map(ref => {
              const props = referenceProperties(ref)
              return (model.requestFormat === 'v6k_url' && ref.url !== undefined) || Object.keys(props).length ? { ...props, url: referenceValue(ref) } : referenceValue(ref)
            })
          }
          break
        }
        if (parameters.duration !== undefined) { if (payload.seconds !== undefined && payload.seconds !== parameters.duration) throw new Error('MEDIA_ALIAS_CONFLICT: duration/seconds'); payload.seconds = parameters.duration; delete payload.duration }
        if (input.references?.length) {
          const refs = input.references.map(ref => referenceValue(ref))
          const field = model.referenceField
          if (!field) throw new Error('MEDIA_REFERENCE_SHAPE_UNAVAILABLE')
          if (model.referenceShape === 'native_content' && (parameters.metadata as any)?.content !== undefined) throw new Error('MEDIA_REFERENCE_INPUT_CONFLICT: native content')
          if (model.referenceShape === 'native_content') payload.metadata = { ...(parameters.metadata as Record<string, unknown> ?? {}), content: input.references.map((ref, i) => { const kind=ref.mediaType.split('/')[0]!; return { ...referenceProperties(ref), type: kind+'_url', [kind+'_url']: { url: refs[i] }, role: ref.role ?? (kind==='image'?'reference_image':'reference') } }) }
          else if (model.referenceShape === 'url_object') { if (refs.length !== 1) throw new Error('MEDIA_REFERENCE_LIMIT'); payload[field] = { ...referenceProperties(input.references[0]!), url: refs[0] } }
          else if (model.referenceShape === 'single') { if (refs.length !== 1) throw new Error('MEDIA_REFERENCE_LIMIT'); payload[field] = refs[0] }
          else payload[field] = input.references.map((ref, i) => Object.keys(referenceProperties(ref)).length ? { ...referenceProperties(ref), url: refs[i] } : refs[i])
        }
        break
      case 'chat_music':
        path = '/v1/chat/completions'
        payload.messages = [{ role: 'user', content: input.prompt }]
        payload.stream = false
        break
      default: throw new Error('MEDIA_OPERATION_UNAVAILABLE')
    }
    if (input.operation === 'video' && ['v6k_url','yunfei_multimodal'].includes(model.requestFormat ?? '')) {
      for (const kind of ['image','video','audio']) {
        const expected=(input.references??[]).filter(ref=>ref.mediaType.startsWith(kind+'/'))
        const field=kind+'s'
        const sent=payload[field] as Array<string|Record<string,unknown>>|undefined
        if ((sent?.length??0)!==expected.length || expected.some((ref,i)=>(typeof sent![i]==='string'?sent![i]:(sent![i] as any).url)!==referenceValue(ref))) throw new Error('MEDIA_REFERENCE_INTENT_MISMATCH: '+field)
      }
    }
    const body = JSON.stringify(payload)
    if (Math.max(Buffer.byteLength(body), Buffer.byteLength(JSON.stringify({ operation: input.operation, request: payload }))) > Math.min(MAX_MEDIA_REQUEST_BYTES, model.maxRequestBytes ?? MAX_MEDIA_REQUEST_BYTES)) throw new Error('MEDIA_REQUEST_TOO_LARGE')
    return { path, payload, body }
  }

  private async json(base: string, path: string, key: string, init: RequestInit = {}): Promise<any> {
    const timeout = AbortSignal.timeout(init.method === 'POST' && !path.endsWith('/estimates') ? 185_000 : 30_000)
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    const response = await mediaAbortable(this.fetcher(base + path, { ...init, redirect: 'error', headers: { ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}), ...init.headers, authorization: `Bearer ${key}` }, signal }), signal)
    if (!response.ok) {
      const error = mediaHttpError('MEDIA_HTTP', response)
      // Read only a bounded error envelope; never propagate provider text or URLs.
      let raw = '', total = 0
      const reader = response.body?.getReader()
      try { if (reader) for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > 8192) break; raw += new TextDecoder().decode(part.value) } } finally { await reader?.cancel().catch(() => {}) }
      try {
        const value = JSON.parse(raw), code = value.error?.code ?? value.code
        if ([400,415,422].includes(response.status) && ['unsupported_reference_format','base64_not_supported','reference_url_required'].includes(code)) throw Object.assign(new Error('MEDIA_REFERENCE_URL_REQUIRED: 服务端明确拒绝了参考素材格式；请为相应素材提供公网 HTTPS 直链。'), { rejected: true })
      } catch (cause) { if ((cause as any)?.rejected) throw cause }
      const value = (() => { try { return JSON.parse(raw) } catch { return {} } })()
      const detail = safeMediaValue(value.error ?? value, [key])
      Object.assign(error, { response: { status: response.status, error: detail } })
      const code = typeof detail?.code === 'string' ? detail.code : ''
      const message = typeof detail?.message === 'string' ? detail.message : ''
      if (code || message) error.message += ': ' + [code, message].filter(Boolean).join(' — ').slice(0, 1000)
      throw error
    }
    return mediaAbortable(response.json(), signal)
  }

  async preview(input: MediaRequest): Promise<MediaDiagnostics> {
    if (input.operation === 'video') input = normalizeMediaReferences(input)
    const { model, key } = await this.resolve(input)
    this.validate(input, model)
    const { payload } = this.wire(input, model)
    return { stage:'prepared', requestHash:hash(JSON.stringify(canonical(payload))), request:safeMediaValue(payload,[key]), references:Object.fromEntries(['image','video','audio'].map(kind=>[kind,(input.references??[]).filter(ref=>ref.mediaType.startsWith(kind+'/')).length])) }
  }

  async estimate(input: MediaRequest): Promise<{ currency: string; maximumCharge?: string; total?: string }> {
    if (input.operation === 'video') input = normalizeMediaReferences(input)
    const { model, key, base } = await this.resolve(input)
    this.validate(input, model)
    const reply = await this.json(base, '/v1/sub2api/estimates', key, { method: 'POST', body: JSON.stringify({ operation: input.operation, request: this.wire(input, model).payload }) })
    return { currency: String(reply.currency ?? ''), ...(reply.maximum_charge != null ? { maximumCharge: String(reply.maximum_charge) } : {}), ...(reply.calculation?.total != null ? { total: String(reply.calculation.total) } : {}) }
  }

  async submit(input: MediaRequest, signal?: AbortSignal): Promise<MediaTask> {
    if (input.operation === 'video') input = normalizeMediaReferences(input)
    // Hash the request before sharing in-flight work: reusing an id for a different
    // prompt must never silently join another submission.
    const parametersHash = hash(JSON.stringify(canonical(input)))
    const previous = this.operations.get(input.requestId)
    if (previous) { const result = await previous; if (result.parametersHash !== parametersHash) throw new Error('MEDIA_IDEMPOTENCY_CONFLICT'); return result }
    const operation = this.submitOnce(input, parametersHash, signal)
    this.operations.set(input.requestId, operation)
    try { return await operation } finally { this.operations.delete(input.requestId) }
  }

  private async submitOnce(input: MediaRequest, parametersHash: string, signal?: AbortSignal): Promise<MediaTask> {
    const { model, key, snapshot, base } = await this.resolve(input)
    this.validate(input, model)
    const { path, payload, body } = this.wire(input, model)
    if (model.maxRequestBytes && Buffer.byteLength(JSON.stringify(payload)) > model.maxRequestBytes) throw new Error('MEDIA_REQUEST_TOO_LARGE')
    const old = await this.get(input.requestId)
    if (old) {
      await this.assertOwner(old, snapshot, key)
      if (old.parametersHash !== parametersHash) throw new Error('MEDIA_IDEMPOTENCY_CONFLICT')
      if (old.status === 'rejected') throw Object.assign(new Error('MEDIA_REQUEST_REJECTED: 修正素材或参数后请使用新请求。'), { rejected: true })
      if (old.taskId || old.status === 'completed') return old.taskId ? this.query(old.requestId, signal) : dto(old)
      // An uncertain POST can only be replayed with its exact original idempotency
      // key and body. There is no automatic new submission or new paid request.
    }
    const now = new Date().toISOString()
    const task: StoredTask = old ?? { requestId: input.requestId, parametersHash, account: snapshot.email ?? '', gateway: base, keyHash: hash(key), selection: { groupId: input.groupId, modelId: input.modelId, profileId: input.profileId, operation: input.operation }, status: 'submitting', artifacts: [], createdAt: now, updatedAt: now }
    task.diagnostics = { stage: 'attempted', requestHash: hash(JSON.stringify(canonical(payload))), request: safeMediaValue(payload, [key]), references: Object.fromEntries(['image', 'video', 'audio'].map(kind => [kind, (input.references ?? []).filter(ref => ref.mediaType.startsWith(kind + '/')).length])) }
    await this.save(task)
    try {
      const reply = await this.json(base, path, key, { method: 'POST', body, headers: { 'Idempotency-Key': input.requestId }, ...(signal ? { signal } : {}) })
      task.diagnostics.response = safeMediaResponse(reply, [key]); task.diagnostics.upstream = safeMediaResponse(reply.submission, [key])
      await this.accept(task, reply)
      return dto(task)
    } catch (error) {
      if ((error as any)?.response) task.diagnostics.response = (error as any).response
      if (error instanceof Error && (/^MEDIA_HTTP_(400|401|403|404|409|413|415|422|429)(:|$)/.test(error.message) || (error as any).rejected)) {
        task.status = 'rejected'; await this.save(task)
        throw Object.assign(new Error(error.message + ': 请检查模型、参数、费用和账号状态后重试。'), { rejected: true })
      }
      task.status = 'submission-uncertain'
      await this.save(task)
      // No raw network/provider text is allowed to cross the credential boundary.
      throw new Error(`MEDIA_SUBMISSION_UNCERTAIN: ${input.requestId}; 请用原请求恢复。${error instanceof Error && /^MEDIA_HTTP_/.test(error.message) ? ' ' + error.message : ''}`, { cause: error instanceof Error && /^MEDIA_HTTP_\d+$/.test(error.message) ? new Error(error.message) : undefined })
    }
  }

  private async accept(task: StoredTask, reply: any): Promise<void> {
    // The unified task endpoint uses in_progress while provider protocols use running.
    if (reply?.status === 'in_progress') reply = { ...reply, status: 'running' }
    if (!reply || typeof reply !== 'object' || (reply.status !== undefined && (typeof reply.status !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(reply.status)))) throw new Error('MEDIA_INVALID_TASK_RESPONSE')
    if (reply.error && !['failed', 'rejected', 'cancelled', 'manual_review'].includes(reply.status)) throw new Error('MEDIA_PROVIDER_REPORTED_ERROR')
    if (reply.model && reply.model !== task.selection.modelId) throw new Error('MEDIA_TASK_IDENTITY_MISMATCH')
    if (reply.status !== undefined && (typeof reply.id !== 'string' || !/^mt_[A-Za-z0-9_-]+$/.test(reply.id))) throw new Error('MEDIA_INVALID_TASK_RESPONSE')
    if (typeof reply.id === 'string' && /^mt_[A-Za-z0-9_-]+$/.test(reply.id)) task.taskId = reply.id
    task.status = reply.status === 'failed' && reply.diagnostic === 'reference_url_required' ? 'rejected' : typeof reply.status === 'string' ? reply.status : 'completed'
    if (!task.taskId && !['completed', 'succeeded'].includes(task.status)) throw new Error('MEDIA_INVALID_TASK_RESPONSE')
    const entries: any[] = Array.isArray(reply.data) && reply.data.length ? [...reply.data] : Array.isArray(reply.artifacts) ? [...reply.artifacts] : []
    if (!entries.length) {
      for (const candidate of reply.candidates ?? []) for (const part of candidate.content?.parts ?? []) if (part.inlineData?.data) entries.push({ b64_json: part.inlineData.data, mime_type: part.inlineData.mimeType })
      for (const choice of reply.choices ?? []) if (choice.message?.audio?.data) entries.push({ b64_json: choice.message.audio.data, mime_type: 'audio/wav' })
    }
    const artifacts: StoredArtifact[] = []
    let pending = !entries.length
    for (const [index, entry] of entries.entries()) {
      if (entry.available === false) { pending = true; continue }
      const key = typeof entry.key === 'string' && /^[\w-]+$/.test(entry.key) ? entry.key : String(index)
      const fallback = task.selection.operation === 'video' ? 'video/mp4' : task.selection.operation === 'chat_music' ? 'audio/wav' : 'image/png'
      const artifact: StoredArtifact = { key, mediaType: typeof entry.mime_type === 'string' ? entry.mime_type : fallback,
        ...(typeof entry.revised_prompt === 'string' ? { revisedPrompt: entry.revised_prompt } : {}),
        ...(typeof entry.quality === 'string' ? { quality: entry.quality } : {}),
        ...(Number.isFinite(Number(entry.duration_seconds ?? entry.duration)) && Number(entry.duration_seconds ?? entry.duration) > 0 ? { duration: Number(entry.duration_seconds ?? entry.duration) } : {}),
        ...(Number.isSafeInteger(entry.size_bytes) && entry.size_bytes > 0 ? { bytes: entry.size_bytes } : {}) }
      const existing = task.artifacts.find(a => a.key === key && a.file)
      if (existing) Object.assign(artifact, { file: existing.file, sha256: existing.sha256, bytes: existing.bytes })
      if (typeof entry.b64_json === 'string') {
        if (entry.b64_json.length > MAX_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.b64_json)) throw new Error('MEDIA_INVALID_BASE64_RESULT')
        await this.cache(task, artifact, Buffer.from(entry.b64_json, 'base64'))
      } else if (typeof (entry.content_url ?? entry.url) === 'string') {
        artifact.source = this.artifactURL(task.gateway, entry.content_url ?? entry.url).href
      }
      if (artifact.file || artifact.source) artifacts.push(artifact)
      else pending = true
    }
    task.artifactsPending = pending
    if (artifacts.length) task.artifacts = artifacts
    if (!task.taskId && !task.artifacts.length) throw new Error('MEDIA_EMPTY_RESULT')
    if (task.diagnostics) task.diagnostics.stage = 'accepted'
    if (['failed', 'rejected', 'cancelled', 'manual_review', 'unknown'].includes(task.status)) {
      const key = await this.secrets.get(`zerowall.ai-cloud.group.${task.selection.groupId}`)
      const reason = reply.diagnostic || reply.error?.message || reply.error?.code
      if (typeof reason === 'string') task.error = safeMediaValue(reason, key ? [key] : [])
      else if (task.status !== 'unknown') task.error = `MEDIA_TASK_${task.status.toUpperCase()}`
      else delete task.error
    } else delete task.error
    await this.save(task)
  }

  private artifactURL(base: string, raw: string): URL {
    const url = new URL(raw, base)
    // Gateway-owned artifacts require the original group key. External HTTPS
    // delivery is fetched without any authorization and with redirects disabled.
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('MEDIA_UNSAFE_ARTIFACT_URL')
    if (url.origin === base && !/^\/v1\/tasks\/mt_[\w-]+\/artifacts\/[\w-]+\/content$/.test(url.pathname)) throw new Error('MEDIA_INVALID_AUTHENTICATED_ARTIFACT')
    if (url.origin !== base && (url.hostname === 'localhost' || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || !url.hostname.includes('.'))) throw new Error('MEDIA_UNSAFE_ARTIFACT_HOST')
    return url
  }

  private async assertOwner(task: StoredTask, snapshot: AiCloudAccountSnapshot, key: string): Promise<void> {
    if (snapshot.status !== 'signedIn' || task.account !== snapshot.email || task.gateway !== gateway(snapshot.gatewayBaseUrl ?? '') || task.keyHash !== hash(key)) throw new Error('MEDIA_TASK_ACCOUNT_MISMATCH')
  }

  private async owner(task: StoredTask): Promise<string> {
    const snapshot = await this.account.current()
    const key = await this.secrets.get(`zerowall.ai-cloud.group.${task.selection.groupId}`)
    if (!key) throw new Error('MEDIA_CREDENTIAL_UNAVAILABLE')
    await this.assertOwner(task, snapshot, key)
    return key
  }

  async query(requestId: string, signal?: AbortSignal): Promise<MediaTask> {
    const task = await this.get(requestId)
    if (!task) throw new Error('MEDIA_TASK_NOT_FOUND')
    const key = await this.owner(task)
    if (!task.taskId) { if (task.status === 'completed') return dto(task); throw new Error('MEDIA_SUBMISSION_UNCERTAIN: 请使用原请求及同一 requestId 恢复。') }
    const reply = await this.json(task.gateway, `/v1/tasks/${encodeURIComponent(task.taskId)}`, key, signal ? { signal } : {})
    if (reply.id !== task.taskId || reply.model !== task.selection.modelId) throw new Error('MEDIA_TASK_IDENTITY_MISMATCH')
    if (task.diagnostics) { task.diagnostics.response = safeMediaResponse(reply, [key]); task.diagnostics.upstream = safeMediaResponse(reply.submission, [key]) }
    await this.accept(task, reply)
    return dto(task)
  }

  async wait(requestId: string, timeoutMs = 600_000, signal?: AbortSignal): Promise<MediaTask> {
    const end = Date.now() + Math.min(Math.max(timeoutMs, 1), 3_600_000)
    for (;;) {
      const task = await this.query(requestId, signal)
      if (['completed', 'succeeded', 'failed', 'cancelled', 'manual_review', 'unknown'].includes(task.status)) return task
      if (Date.now() >= end) return task
      const catalog = await this.catalog()
      const interval = catalog.models.find(m => m.profileId === task.selection.profileId)?.pollSeconds ?? 5
      await delay(Math.min(Math.max(interval, 1) * 1000, end - Date.now()), undefined, signal ? { signal } : {})
    }
  }

  async download(requestId: string, artifactKey: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; mediaType: string; sha256: string; duration?: number }> {
    const task = await this.get(requestId)
    if (!task) throw new Error('MEDIA_TASK_NOT_FOUND')
    const key = await this.owner(task)
    const artifact = task.artifacts.find(a => a.key === artifactKey)
    if (!artifact) throw new Error('MEDIA_ARTIFACT_NOT_FOUND')
    if (artifact.file) {
      if (!/^[a-f0-9]{64}-[a-f0-9]{64}-[a-f0-9]{64}\.bin$/.test(artifact.file)) throw new Error('MEDIA_INVALID_CACHE_PATH')
      const bytes = await readFile(join(this.cacheDir, artifact.file))
      if (hash(bytes) !== artifact.sha256) throw new Error('MEDIA_CACHE_HASH_MISMATCH')
      // Older journals used provider MIME hints. Reinspect existing bytes too,
      // so recovering an already cached M4A never writes it as WAV or MP3.
      const actual = artifactFormat(bytes)
      if (actual.mediaType.split('/')[0] !== artifact.mediaType.split('/')[0]) throw new Error('MEDIA_ARTIFACT_TYPE_MISMATCH')
      Object.assign(artifact, actual)
      await this.save(task)
      return { bytes, mediaType: artifact.mediaType, sha256: artifact.sha256, ...(artifact.duration!==undefined?{duration:artifact.duration}:{}) }
    }
    if (!artifact.source) throw new Error('MEDIA_ARTIFACT_UNAVAILABLE')
    const url = this.artifactURL(task.gateway, artifact.source)
    if (artifact.mediaType.startsWith('image/')) {
      const result = await downloadImageBytes(url, { ...(signal ? { signal } : {}), fetch: url.origin === task.gateway
        ? (url, signal, headers) => this.fetcher(url, { redirect: 'error', headers: { ...headers, authorization: `Bearer ${key}` }, signal })
        : this.externalFetch })
      await this.cache(task, artifact, result.bytes)
      await this.save(task)
      return { bytes: result.bytes, mediaType: artifact.mediaType, sha256: artifact.sha256! }
    }
    const downloadSignal = signal ?? new AbortController().signal
    const authenticated = url.origin === task.gateway
    const bytes = await downloadMediaBytes((headers, partSignal) => authenticated
      ? this.fetcher(url, { redirect: 'error', headers: { ...headers, authorization: `Bearer ${key}` }, signal: partSignal })
      : this.externalFetch(url, partSignal), downloadSignal, authenticated)
    if (artifact.bytes !== undefined && artifact.bytes !== bytes.length) throw new Error('MEDIA_TRUNCATED_ARTIFACT')
    await this.cache(task, artifact, bytes)
    await this.save(task)
    return { bytes, mediaType: artifact.mediaType, sha256: artifact.sha256!, ...(artifact.duration!==undefined?{duration:artifact.duration}:{}) }
  }

  private async cache(task: StoredTask, artifact: StoredArtifact, bytes: Uint8Array): Promise<void> {
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('MEDIA_INVALID_ARTIFACT_SIZE')
    const digest = hash(bytes)
    const actual = artifactFormat(bytes)
    if (actual.mediaType.split('/')[0] !== artifact.mediaType.split('/')[0]) throw new Error('MEDIA_ARTIFACT_TYPE_MISMATCH')
    Object.assign(artifact, actual)
    await mkdir(this.cacheDir, { recursive: true, mode: 0o700 })
    const file = `${hash(task.requestId)}-${hash(artifact.key)}-${digest}.bin`
    const temporary = join(this.cacheDir, `${file}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' })
      await rename(temporary, join(this.cacheDir, file))
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
    Object.assign(artifact, { file, sha256: digest, bytes: bytes.length })
  }

  private async all(): Promise<StoredTask[]> {
    const value = await this.secrets.get(JOURNAL)
    if (!value) return []
    try {
      const tasks: StoredTask[] = JSON.parse(value)
      const seen = new Set<string>()
      if (!Array.isArray(tasks)) throw new Error()
      for (const task of tasks) {
        if (!task || !/^[a-zA-Z0-9_-]{8,128}$/.test(task.requestId) || seen.has(task.requestId)
          || !/^[a-f0-9]{64}$/.test(task.keyHash) || !/^[a-f0-9]{64}$/.test(task.parametersHash)
          || typeof task.account !== 'string' || gateway(task.gateway) !== task.gateway
          || !task.selection || !['groupId', 'modelId', 'profileId', 'operation'].every(k => typeof (task.selection as any)[k] === 'string')
          || !Array.isArray(task.artifacts) || typeof task.status !== 'string') throw new Error()
        seen.add(task.requestId)
        if (task.taskId && !/^mt_[A-Za-z0-9_-]+$/.test(task.taskId)) throw new Error()
        for (const artifact of task.artifacts) {
          if (!artifact || !/^[\w-]+$/.test(artifact.key) || !/^(image|audio|video)\/[a-z0-9.+-]+$/.test(artifact.mediaType)) throw new Error()
          if (artifact.source) this.artifactURL(task.gateway, artifact.source)
        }
      }
      return tasks
    } catch { throw new Error('MEDIA_JOURNAL_INVALID: 任务记录损坏，请保留记录并修复；不会重新提交。') }
  }
  private async get(id: string): Promise<StoredTask | undefined> { await this.writes; return (await this.all()).find(t => t.requestId === id) }
  private async save(task: StoredTask): Promise<void> {
    task.updatedAt = new Date().toISOString()
    const operation = this.writes.catch(() => {}).then(async () => {
      const tasks = (await this.all()).filter(t => t.requestId !== task.requestId)
      tasks.push(task)
      await this.secrets.set(JOURNAL, JSON.stringify(tasks))
    })
    this.writes = operation; await operation
  }
  async list(): Promise<MediaTask[]> {
    const signal = AbortSignal.timeout(30_000)
    const snapshot = await mediaAbortable(this.account.current(), signal)
    if (snapshot.status !== 'signedIn') return []
    await mediaAbortable(this.writes, signal)
    return (await mediaAbortable(this.all(), signal)).filter(t => t.account === snapshot.email && t.gateway === gateway(snapshot.gatewayBaseUrl ?? '')).map(dto)
  }
}
