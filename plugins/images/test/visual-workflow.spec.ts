import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { installVisualAssets, recordAssetReview, recordVisualAsset, validatePresentationAssets } from '../src/host/visual-assets.js'

it('rejects incomplete, reordered and changed image workflows while preserving edits without new imagery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-visual-workflow-'))
  try {
    await writeFile(join(root, 'presentation-spec.json'), JSON.stringify({ width: 960, height: 540, fonts: {}, palette: {}, slides: [{}] }))
    const flow = { spec: 'presentation-spec.json', manifest: 'visual-assets.json', mode: 'new' as const }
    const sha = (value: string) => createHash('sha256').update(value).digest('hex')
    const style = [1, 2, 3].map(n => ({ assetId: `s${n}`, path: join(root, `s${n}.png`), sha256: sha(`style${n}`), role: 'style-candidate' }))
    await Promise.all(style.map((item, i) => writeFile(item.path, `style${i + 1}`)))
    await writeFile(join(root, 'visual-assets.json'), JSON.stringify({ assets: style }))
    await expect(validatePresentationAssets(root, flow, 1)).rejects.toThrow('Select and visually review')
    const seed = { assetId: 'seed', path: join(root, 'seed.png'), sha256: sha('seed'), role: 'content-seed' }
    await writeFile(seed.path, 'seed')
    const asset = { assetId: 'final', path: join(root, 'final.png'), sha256: sha('final'), role: 'illustration', slideNumber: 1, sourceSeedPath: seed.path, styleReferenceIds: ['s1'], inputImageHashes: [seed.sha256, style[0]!.sha256] }
    await writeFile(asset.path, 'final')
    const manifest = { assets: [...style, seed, asset], selectedStyleAssetId: 's1', styleReview: 'Reviewed all three actual images', assetReviews: { final: 'No text; subject clear; good contrast' } }
    await writeFile(join(root, 'visual-assets.json'), JSON.stringify(manifest))
    await expect(validatePresentationAssets(root, flow, 1)).resolves.toBeUndefined()
    asset.inputImageHashes.reverse(); await writeFile(join(root, 'visual-assets.json'), JSON.stringify(manifest))
    await expect(validatePresentationAssets(root, flow, 1)).rejects.toThrow('seed first')
    await expect(validatePresentationAssets(root, { ...flow, mode: 'edit' }, 1)).resolves.toBeUndefined()
    asset.inputImageHashes.reverse(); await writeFile(join(root, 'visual-assets.json'), JSON.stringify(manifest)); await writeFile(asset.path, 'changed')
    await expect(validatePresentationAssets(root, flow, 1)).rejects.toThrow('changed after review')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('serializes asset and review writes and invalidates replaced assets and dependent reviews', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-review-replacement-'))
  try {
    const manifest = 'visual-assets.json'
    for (let i = 1; i <= 4; i++) {
      const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: i * 30, g: 90, b: 180 } } }).png().toBuffer()
      const path = join(root, `s${i}.png`)
      await writeFile(path, bytes)
      await writeFile(path + '.generation.json', JSON.stringify({ sha256: createHash('sha256').update(bytes).digest('hex'), model: 'environment', inputImageHashes: [], createdAt: new Date().toISOString() }))
    }
    await Promise.all([1, 2, 3].map(i => recordVisualAsset(root, { manifest, image: `s${i}.png`, assetId: `s${i}`, role: 'style-candidate' })))
    await Promise.all([
      recordAssetReview(root, manifest, 'style', 's1', 'Actual candidates viewed, first has clear whitespace.'),
      recordVisualAsset(root, { manifest, image: 's4.png', assetId: 'final', role: 'illustration', styleReferenceIds: ['s1'] }),
    ])
    await recordAssetReview(root, manifest, 'asset', 'final', 'Actual asset viewed, no lettering or chart-like marks.')
    let value = JSON.parse(await readFile(join(root, manifest), 'utf8'))
    expect(value.assets).toHaveLength(4); expect(value.styleReview).toBeTruthy(); expect(value.assetReviews.final).toBeTruthy()
    await recordVisualAsset(root, { manifest, image: 's4.png', assetId: 's1', role: 'style-candidate' })
    value = JSON.parse(await readFile(join(root, manifest), 'utf8'))
    expect(value.styleReview).toBeUndefined(); expect(value.assetReviews.final).toBeUndefined()
    await recordAssetReview(root, manifest, 'asset', 'final', 'Actual asset viewed again after style change review.')
    await recordVisualAsset(root, { manifest, image: 's4.png', assetId: 'final', role: 'illustration' })
    expect(JSON.parse(await readFile(join(root, manifest), 'utf8')).assetReviews.final).toBeUndefined()
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('enforces current-chat image capability through asynchronous execution middleware', async () => {
  const hooks: Record<string, any> = {}; const events: any[] = []; const registered: any[] = []
  let imageInput = false
  const ctx: any = { effect: () => {}, on: (name: string, hook: any) => { hooks[name] = hook }, tools: { register: (tool: any) => registered.push(tool) }, llm: { resolveModelInfo: async () => ({ inputModalities: imageInput ? ['text', 'image'] : ['text'] }) } }
  installVisualAssets(ctx)
  const agent = { session: { id: 'session', header: { cwd: 'workspace' }, snapshotEvents: () => events, append: (type: string, data: unknown) => events.push({ type, data }) } }
  hooks['tools/result']({ name: 'skill', arguments: { name: 'zerowall-presentation' }, agent }, { isError: false })
  const stream = () => hooks['llm/stream']({ sessionId: 'session', provider: 'current', model: 'selected' }, async function* () {})
  for await (const _ of stream()) { /* resolve current route */ }
  const next = vi.fn()
  await expect(hooks['tools/execute']({ name: 'univer_compile_svg', arguments: { page: 1 }, agent }, next)).rejects.toThrow('支持图像输入')
  expect(next).not.toHaveBeenCalled()
  imageInput = true; for await (const _ of stream()) { /* changed current route */ }
  await expect(hooks['tools/execute']({ name: 'univer_compile_svg', arguments: { page: 1 }, agent }, next)).rejects.toThrow('presentation_prepare')
  await hooks['tools/execute']({ name: 'read_uploaded_file', arguments: {}, agent }, next)
  expect(next).toHaveBeenCalledOnce()
})
