import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import sharp from 'sharp'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'

interface PresentationWorkflow { spec: string; manifest: string; mode: 'new' | 'edit'; changedPages: number[]; reviews: Record<string, string>; checks: Record<string, string[]> }
declare module '@deepseek-ai/dsh-session/types' { interface SessionEventMap { 'zerowall/presentation-workflow': PresentationWorkflow } }
(KNOWN_SESSION_EVENT_TYPES as Set<string>).add('zerowall/presentation-workflow')

export interface VisualAsset {
  assetId: string; role: string; slideNumber?: number; path: string; sha256: string
  mediaType: string; width: number; height: number; model: string; providerId: string; groupId: string
  requestedQuality: string; actualQuality: string; requestedSize: string; promptHash: string
  inputImageHashes: string[]; styleReferenceIds: string[]; sourceSeedPath?: string; revisedPrompt?: string; createdAt: string
}
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
async function workspacePath(cwd: string, path: string): Promise<string> {
  const root = await realpath(cwd)
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Visual artifacts must stay inside the current workspace.')
  const parent = await realpath(dirname(target))
  if (relative(root, parent).startsWith('..') || isAbsolute(relative(root, parent))) throw new Error('Visual artifact directory escapes the workspace.')
  const info = await lstat(target).catch(() => undefined)
  if (info?.isSymbolicLink()) throw new Error('Visual artifacts cannot be symbolic links.')
  return target
}
const locks = new Map<string, Promise<unknown>>()
async function withManifestLock<T>(manifest: string, action: () => Promise<T>): Promise<T> {
  const operation = (locks.get(manifest) ?? Promise.resolve()).catch(() => undefined).then(action)
  locks.set(manifest, operation)
  try { return await operation } finally { if (locks.get(manifest) === operation) locks.delete(manifest) }
}
async function saveManifest(manifest: string, value: unknown): Promise<void> {
  const temporary = manifest + `.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2))
  await rename(temporary, manifest)
}
export async function validatePresentationAssets(cwd: string, workflow: Pick<PresentationWorkflow, 'spec' | 'manifest' | 'mode'>, page?: number) {
  const spec = JSON.parse(await readFile(await workspacePath(cwd, workflow.spec), 'utf8'))
  if (!Array.isArray(spec.slides) || !spec.slides.length || !spec.width || !spec.height || !spec.fonts || !spec.palette) throw new Error('presentation-spec.json requires width, height, fonts, palette and slides.')
  if (workflow.mode === 'edit') return
  const manifest = JSON.parse(await readFile(await workspacePath(cwd, workflow.manifest), 'utf8'))
  const candidates: VisualAsset[] = manifest.assets?.filter((asset: VisualAsset) => asset.role === 'style-candidate') ?? []
  if (candidates.length < 3 || new Set(candidates.map(asset => asset.sha256)).size < 3) throw new Error('Generate and register three distinct style candidates before authoring.')
  const style = candidates.find(asset => asset.assetId === manifest.selectedStyleAssetId)
  if (!style || !manifest.styleReview) throw new Error('Select and visually review a style candidate before authoring.')
  for (const candidate of candidates) {
    if (hash(await readFile(await workspacePath(cwd, candidate.path))) !== candidate.sha256) throw new Error(`Style ${candidate.assetId} changed after review.`)
  }
  const pages = page === undefined ? spec.slides.map((_: unknown, i: number) => i + 1) : [page]
  for (const number of pages) {
    if (!Number.isInteger(number) || !spec.slides[number - 1]) throw new Error('Page is outside the presentation specification.')
    const finals: VisualAsset[] = manifest.assets.filter((asset: VisualAsset) => asset.slideNumber === number && !['style-candidate', 'content-seed'].includes(asset.role))
    if (!finals.length) throw new Error(`Page ${number} needs a registered, reviewed independent visual asset.`)
    for (const asset of finals) {
      const seed = asset.sourceSeedPath && manifest.assets.find((item: VisualAsset) => item.path === asset.sourceSeedPath && item.role === 'content-seed')
      if (!seed || !asset.styleReferenceIds.includes(style.assetId) || asset.inputImageHashes[0] !== seed.sha256 || asset.inputImageHashes[1] !== style.sha256) throw new Error(`Asset ${asset.assetId} must use edit_image with content seed first and selected style second.`)
      if (hash(await readFile(await workspacePath(cwd, seed.path))) !== seed.sha256) throw new Error(`Seed ${seed.assetId} changed after generation.`)
      if (!manifest.assetReviews?.[asset.assetId]) throw new Error(`Asset ${asset.assetId} still requires current-chat visual review.`)
      if (hash(await readFile(await workspacePath(cwd, asset.path))) !== asset.sha256) throw new Error(`Asset ${asset.assetId} changed after review.`)
    }
  }
}
export async function recordVisualAsset(cwd: string, input: { manifest: string; image: string; assetId: string; role: string; slideNumber?: number; styleReferenceIds?: string[]; sourceSeedPath?: string }): Promise<VisualAsset> {
  const manifest = await workspacePath(cwd, input.manifest)
  return withManifestLock(manifest, async () => {
    const path = await workspacePath(cwd, input.image)
    const bytes = await readFile(path)
    if (bytes.length > 64 * 1024 * 1024) throw new Error('Visual asset exceeds 64 MiB.')
    const receipt = JSON.parse(await readFile(await workspacePath(cwd, path + '.generation.json'), 'utf8'))
    const metadata = await sharp(bytes, { failOn: 'error' }).metadata()
    if (metadata.format !== 'png' || !metadata.width || !metadata.height || hash(bytes) !== receipt.sha256) throw new Error('Visual asset media or generation checksum mismatch.')
    const asset: VisualAsset = { assetId: input.assetId, role: input.role, ...(input.slideNumber === undefined ? {} : { slideNumber: input.slideNumber }), path, sha256: hash(bytes), mediaType: 'image/png', width: metadata.width, height: metadata.height, model: receipt.model, providerId: receipt.providerId, groupId: receipt.groupId, requestedQuality: receipt.requestedQuality, actualQuality: receipt.actualQuality, requestedSize: receipt.requestedSize, promptHash: receipt.promptHash, inputImageHashes: receipt.inputImageHashes ?? [], styleReferenceIds: input.styleReferenceIds ?? [], createdAt: receipt.createdAt, ...(receipt.revisedPrompt ? { revisedPrompt: receipt.revisedPrompt } : {}), ...(input.sourceSeedPath ? { sourceSeedPath: await workspacePath(cwd, input.sourceSeedPath) } : {}) }
    const previous = await readFile(manifest, 'utf8').then(raw => JSON.parse(raw)).catch(error => { if (error.code === 'ENOENT') return { schemaVersion: 1, assets: [] }; throw error })
    if (previous.schemaVersion !== 1 || !Array.isArray(previous.assets)) throw new Error('Invalid visual manifest schema.')
    for (const id of asset.styleReferenceIds) if (!previous.assets.some((item: VisualAsset) => item.assetId === id)) throw new Error(`Unknown style reference ${id}.`)
    const next = { ...previous, assets: [...previous.assets.filter((item: VisualAsset) => item.assetId !== asset.assetId), asset] }
    next.assetReviews = { ...previous.assetReviews }
    delete next.assetReviews[asset.assetId]
    for (const dependent of previous.assets as VisualAsset[]) {
      if (dependent.sourceSeedPath === asset.path || dependent.styleReferenceIds?.includes(asset.assetId)) delete next.assetReviews[dependent.assetId]
    }
    if (asset.role === 'style-candidate' || previous.assets.some((item: VisualAsset) => item.assetId === asset.assetId && item.role === 'style-candidate')) delete next.styleReview
    await saveManifest(manifest, next)
    return asset
  })
}

export async function recordAssetReview(cwd: string, manifestPath: string, kind: 'style' | 'asset', target: string, observations: string): Promise<void> {
  const path = await workspacePath(cwd, manifestPath)
  await withManifestLock(path, async () => {
    const manifest = JSON.parse(await readFile(path, 'utf8'))
    const asset: VisualAsset = manifest.assets?.find((item: VisualAsset) => item.assetId === target)
    if (!asset || hash(await readFile(await workspacePath(cwd, asset.path))) !== asset.sha256) throw new Error('Visual review target is missing or changed.')
    if (kind === 'style') {
      const candidates: VisualAsset[] = manifest.assets.filter((item: VisualAsset) => item.role === 'style-candidate')
      if (asset.role !== 'style-candidate' || candidates.length < 3 || new Set(candidates.map(item => item.sha256)).size < 3) throw new Error('Review three distinct style candidates before selection.')
      for (const candidate of candidates) {
        if (hash(await readFile(await workspacePath(cwd, candidate.path))) !== candidate.sha256) throw new Error('Style candidate is missing or changed.')
      }
      manifest.selectedStyleAssetId = target; manifest.styleReview = observations
    } else { manifest.assetReviews = { ...manifest.assetReviews, [target]: observations } }
    await saveManifest(path, manifest)
  })
}

export function installVisualAssets(ctx: Context): void {
  const routes = new Map<string, { provider: string; model: string; imageInput: boolean }>()
  const deckSessions = new Set<string>()
  ctx.effect(() => () => { routes.clear(); deckSessions.clear() })
  ctx.on('llm/stream', async function* (options, next) {
    if (options.sessionId && options.purpose === undefined) {
      const model = await ctx.llm.resolveModelInfo(options.provider, options.model).catch(() => undefined)
      routes.set(String(options.sessionId), { provider: options.provider, model: options.model, imageInput: model?.inputModalities?.includes('image') === true })
    }
    yield* next()
  })
  ctx.on('tools/result', (exec, result) => {
    if (exec.name === 'skill' && !result.isError && (exec.arguments as { name?: string })?.name === 'zerowall-presentation' && exec.agent) deckSessions.add(String(exec.agent.session.id))
    if (!exec.agent || result.isError) return
    const state = workflow(exec.agent.session)
    if (!state) return
    const args = exec.arguments as { page?: number; pages?: Array<string | number> }
    if (exec.name === 'presentation_record_asset') {
      if ((exec.arguments as { manifest_path?: string }).manifest_path && resolve(exec.agent.session.header.cwd!, (exec.arguments as { manifest_path: string }).manifest_path) !== state.manifest) return
      for (const page of state.changedPages) { delete state.reviews[String(page)]; delete state.checks[String(page)] }
    } else if (exec.name === 'univer_compile_svg' || exec.name === 'univer_execute') {
      const changed = exec.name === 'univer_compile_svg' && args.page ? [args.page] : state.changedPages
      state.changedPages = [...new Set([...state.changedPages, ...changed])]
      for (const page of changed) { delete state.reviews[String(page)]; delete state.checks[String(page)] }
    } else if (['univer_inspect', 'univer_lint', 'univer_screenshot'].includes(exec.name)) {
      const pages = args.pages?.every(page => typeof page === 'number') ? args.pages as number[] : state.changedPages
      for (const page of pages) state.checks[String(page)] = [...new Set([...(state.checks[String(page)] ?? []), exec.name])]
    } else return
    exec.agent.session.append('zerowall/presentation-workflow', state)
  })
  function workflow(session: { snapshotEvents(): readonly { type: string; data: unknown }[] }): PresentationWorkflow | undefined {
    const value = session.snapshotEvents().filter(event => event.type === 'zerowall/presentation-workflow').at(-1)?.data
    return value ? structuredClone(value) as PresentationWorkflow : undefined
  }
  ctx.on('tools/execute', async (exec, next) => {
    const id = String(exec.agent?.session.id ?? '')
    const state = exec.agent && workflow(exec.agent.session)
    if (!deckSessions.has(id) && !state) return next()
    if (!['univer_compile_svg', 'univer_execute', 'univer_export'].includes(exec.name)) return next()
    if (!routes.get(id)?.imageInput) throw new Error('科研 PPT 需要当前聊天模型支持图像输入。请切换聊天模型后继续；已有草稿和图片保留。')
    if (!state || !exec.agent?.session.header.cwd) throw new Error('先保存内容和视觉规划，再调用 presentation_prepare 注册本次生成或编辑流程。')
    await validatePresentationAssets(exec.agent.session.header.cwd, state, exec.name === 'univer_compile_svg' ? (exec.arguments as { page: number }).page : undefined)
    if (exec.name === 'univer_export' && state.changedPages.some(page => !state.reviews[String(page)] || ['univer_inspect', 'univer_lint', 'univer_screenshot'].some(check => !state.checks[String(page)]?.includes(check)))) throw new Error('导出前逐页完成 inspect、lint、screenshot，并用 presentation_record_review 记录当前聊天模型的截图审查。')
    return next()
  })
  ctx.tools.register(defineTool({ name: 'presentation_prepare', description: 'Register saved scientific presentation specification and visual manifest before authoring. new requires three style candidates, seed/style edited assets and reviews; edit preserves existing imagery.', parameters: { spec_path: { type: 'string', required: true }, manifest_path: { type: 'string', required: true }, mode: { type: 'string', enum: ['new', 'edit'], required: true }, changed_pages: { type: 'array', items: { type: 'integer' } } }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: async (args, exec) => {
    if (!exec.agent?.session.header.cwd) throw new Error('Presentation requires a workspace.')
    const spec = await workspacePath(exec.agent.session.header.cwd, args.spec_path)
    const manifest = await workspacePath(exec.agent.session.header.cwd, args.manifest_path)
    const previous = workflow(exec.agent.session)
    const state: PresentationWorkflow = previous?.spec === spec && previous.manifest === manifest && previous.mode === args.mode ? previous : { spec, manifest, mode: args.mode, changedPages: args.changed_pages ?? [], reviews: {}, checks: {} }
    await readFile(spec)
    exec.agent.session.append('zerowall/presentation-workflow', state)
    return 'Presentation workflow registered. Generate and review style candidates and assets before compilation.'
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_record_review', description: 'Persist the current chat model visual review of style candidates, generated assets or a checked page. Call only after viewing actual images; never infer visual PASS from file checks.', parameters: { kind: { type: 'string', enum: ['style', 'asset', 'page'], required: true }, target: { type: 'string', required: true }, observations: { type: 'string', required: true } }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: async (args, exec) => {
    const state = exec.agent && workflow(exec.agent.session)
    if (!state || !exec.agent?.session.header.cwd) throw new Error('先调用 presentation_prepare 注册已保存的规划和资源清单，再登记审查。已有图片保留，无需重新生成。')
    if (!routes.get(String(exec.agent.session.id))?.imageInput) throw new Error('当前聊天模型未确认支持图像输入，请切换支持图像输入的聊天模型后继续审查。已有草稿和图片保留。')
    if (args.observations.trim().length < 20) throw new Error('Record concrete visual observations and any repaired defects.')
    if (args.kind === 'page') {
      if (!state.changedPages.includes(Number(args.target)) || ['univer_inspect', 'univer_lint', 'univer_screenshot'].some(check => !state.checks[args.target]?.includes(check))) throw new Error('Page inspect, lint and screenshot must succeed before review.')
      state.reviews[args.target] = args.observations
      exec.agent.session.append('zerowall/presentation-workflow', state)
    } else {
      await recordAssetReview(exec.agent.session.header.cwd, state.manifest, args.kind, args.target, args.observations)
      for (const page of state.changedPages) { delete state.reviews[String(page)]; delete state.checks[String(page)] }
      exec.agent.session.append('zerowall/presentation-workflow', state)
    }
    return 'Visual observations recorded; changed assets/pages require a new review.'
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_visual_status', description: 'Check the current chat route for scientific PPT visual review. Uses the current model only, never a separate reviewer. Call before style candidates or complete deck authoring.', parameters: {}, output: { schema: { type: 'object', additionalProperties: false, properties: { imageInput: { type: 'boolean', required: true }, provider: { type: 'string' }, model: { type: 'string' }, guidance: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: value.guidance }] }, execute: async (_args, exec) => {
    const route = routes.get(String(exec.agent?.session.id ?? ''))
    return { imageInput: route?.imageInput ?? false, ...(route ? { provider: route.provider, model: route.model } : {}), guidance: route?.imageInput ? '当前聊天模型支持图像输入；继续生成三张样张并视觉审查。' : '当前聊天模型不支持或尚未确认图像输入。请切换支持图像输入的聊天模型；完整 PPT 尚未生成。' }
  } }))
  ctx.tools.register(defineTool({ name: 'presentation_record_asset', description: 'Verify a generated PNG against its generation receipt and atomically register scientific PPT asset provenance. Does not generate imagery or claim visual review passed.', parameters: { manifest_path: { type: 'string', required: true }, image_path: { type: 'string', required: true }, asset_id: { type: 'string', required: true }, role: { type: 'string', required: true }, slide_number: { type: 'integer' }, style_reference_ids: { type: 'array', items: { type: 'string' } }, source_seed_path: { type: 'string' } }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: async (args, exec) => {
    const cwd = exec.agent?.session.header.cwd
    if (!cwd) throw new Error('Presentation visual assets require a workspace.')
    return JSON.stringify(await recordVisualAsset(cwd, { manifest: args.manifest_path, image: args.image_path, assetId: args.asset_id, role: args.role, ...(args.slide_number === undefined ? {} : { slideNumber: args.slide_number }), ...(args.style_reference_ids ? { styleReferenceIds: args.style_reference_ids } : {}), ...(args.source_seed_path ? { sourceSeedPath: args.source_seed_path } : {}) }))
  } }))
}
