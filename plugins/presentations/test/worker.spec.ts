import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ResearchStore } from '@zerowallscience/research-store'
import type { GenerateImageResult, ZeroWallImageGenerationService } from '@zerowallscience/plugin-images'
import { PresentationWorker } from '../src/host/worker.js'
import { materializeDirectImage } from '../src/host/index.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('presentation generation', () => {
  it('materializes direct image paths and base64 data without requiring image.png', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-ppt-direct-image-'))
    roots.push(root)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    const source = join(root, 'reference.custom')
    await writeFile(source, png)
    const fromPath = await materializeDirectImage(root, source)
    expect(fromPath.kind).toBe('image')
    expect(fromPath.path).toMatch(/\.png$/u)
    const fromData = await materializeDirectImage(root, undefined, `data:image/png;base64,${png.toString('base64')}`, 'diagram.bin')
    expect(fromData.checksum).toBe(fromPath.checksum)
    expect(existsSync(fromData.path)).toBe(true)
  })

  it('runs ten slide image requests concurrently and sends the resolved quality', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-ppt-concurrency-'))
    roots.push(root)
    const store = new ResearchStore(join(root, 'research.db'))
    const project = store.createProject({ name: 'Test', rootPath: root })
    const outline = Array.from({ length: 10 }, (_, index) => ({ title: `Slide ${index + 1}`, points: ['Point'] }))
    const presentation = store.createPresentation({ projectId: project.id, title: '并发测试', outline })
    store.updatePresentation(presentation.id, { quality: { structural: 'passed', render: 'unverified', automaticVisual: 'unverified', modelVisual: 'unverified', overall: 'unverified', warnings: ['旧的人工确认提示'] } })
    let active = 0
    let maximum = 0
    const qualities: unknown[] = []
    const service = imageService(async input => {
      active += 1
      maximum = Math.max(maximum, active)
      qualities.push(input.quality)
      await new Promise(resolve => setTimeout(resolve, 25))
      active -= 1
    }, 'high')
    const worker = new PresentationWorker(store, service, 1)
    try {
      worker.generate(presentation.id)
      const ready = await waitReady(store, presentation.id)
      expect(maximum).toBe(10)
      expect(qualities).toEqual(Array(10).fill('high'))
      expect(ready.quality).toBeUndefined()
    } finally {
      worker.dispose()
      store.close()
    }
  }, 15_000)

  it('creates a multi-slide deck and regenerates the same artifact files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-ppt-'))
    roots.push(root)
    const store = new ResearchStore(join(root, 'research.db'))
    const project = store.createProject({ name: 'Test', rootPath: root })
    const presentation = store.createPresentation({ projectId: project.id, title: '科研汇报' })
    const worker = new PresentationWorker(store, 1)
    try {
      worker.generate(presentation.id)
      const first = await waitReady(store, presentation.id)
      expect(first.slides).toHaveLength(6)
      expect(first.artifacts.map(item => item.kind).sort()).toEqual(['pptx'])
      const firstUris = first.artifacts.map(item => item.uri).sort()
      for (const uri of firstUris) expect(existsSync(filePath(uri))).toBe(true)
      const firstSlideUris = first.slides.map(slide => slide.visualUri)
      expect(firstSlideUris.map(uri => filePath(uri ?? '')).map(path => path.replaceAll('\\', '/'))).toEqual(
        Array.from({ length: 6 }, (_, index) => expect.stringMatching(`/visuals/slide-${String(index + 1).padStart(2, '0')}\\.png$`)),
      )

      worker.generate(presentation.id)
      const second = await waitReady(store, presentation.id)
      expect(second.slides).toHaveLength(6)
      expect(second.artifacts.map(item => item.uri).sort()).toEqual(firstUris)
      expect(second.slides.map(slide => slide.visualUri)).toEqual(firstSlideUris)
      expect(second.revisions).toEqual([])
    } finally {
      worker.dispose()
      store.close()
    }
  }, 15_000)

  it('preserves the current images and formal artifacts when regeneration fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-ppt-failure-'))
    roots.push(root)
    const store = new ResearchStore(join(root, 'research.db'))
    const project = store.createProject({ name: 'Test', rootPath: root })
    const presentation = store.createPresentation({ projectId: project.id, title: '失败保留测试' })
    let fail = false
    let call = 0
    const worker = new PresentationWorker(store, imageService(() => {
      call += 1
      if (fail && call % 6 === 2) throw new Error('injected visual failure')
    }), 1)
    try {
      worker.generate(presentation.id)
      const first = await waitReady(store, presentation.id)
      const slideUris = first.slides.map(slide => slide.visualUri ?? '')
      const artifactUris = first.artifacts.filter(item => item.kind === 'pptx').map(item => item.uri).sort()
      const before = new Map([...slideUris, ...artifactUris].map(uri => [uri, readFileSync(filePath(uri))]))

      fail = true
      worker.generate(presentation.id)
      const failed = await waitFailed(store, presentation.id)
      expect(failed.error).toContain('injected visual failure')
      expect(failed.slides.map(slide => slide.visualUri)).toEqual(slideUris)
      expect(failed.artifacts.filter(item => item.kind === 'pptx').map(item => item.uri).sort()).toEqual(artifactUris)
      for (const [uri, bytes] of before) expect(readFileSync(filePath(uri))).toEqual(bytes)
    } finally {
      worker.dispose()
      store.close()
    }
  }, 15_000)

  it('retries only the failed slide and keeps all other slide records', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-ppt-retry-'))
    roots.push(root)
    const store = new ResearchStore(join(root, 'research.db'))
    const project = store.createProject({ name: 'Test', rootPath: root })
    const outline = Array.from({ length: 4 }, (_, index) => ({ title: `Slide ${index + 1}`, points: ['Point'] }))
    const presentation = store.createPresentation({ projectId: project.id, title: '单页重试', outline })
    let fail = true
    const paths: string[] = []
    const worker = new PresentationWorker(store, imageService(input => {
      paths.push(input.outputPath)
      if (fail && input.outputPath.includes('slide-03')) throw new Error('third slide failed')
    }), 1)
    try {
      worker.generate(presentation.id)
      const failed = await waitFailed(store, presentation.id)
      const failedSlide = failed.slides[2]!
      expect(failedSlide.visualStatus).toBe('failed')
      expect(failed.slides.filter(slide => slide.visualStatus === 'ready')).toHaveLength(3)
      const untouched = failed.slides.filter(slide => slide.id !== failedSlide.id).map(slide => ({ id: slide.id, uri: slide.visualUri, checksum: slide.visual?.checksum }))
      paths.length = 0
      fail = false
      const ready = await worker.retrySlide(presentation.id, failedSlide.id)
      expect(ready.status).toBe('ready')
      expect(paths).toHaveLength(1)
      expect(paths[0]).toContain('slide-03')
      expect(ready.slides.filter(slide => slide.id !== failedSlide.id).map(slide => ({ id: slide.id, uri: slide.visualUri, checksum: slide.visual?.checksum }))).toEqual(untouched)
    } finally {
      worker.dispose()
      store.close()
    }
  }, 15_000)

  it('allows an existing ready slide to be regenerated independently', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-ppt-ready-retry-'))
    roots.push(root)
    const store = new ResearchStore(join(root, 'research.db'))
    const project = store.createProject({ name: 'Test', rootPath: root })
    const presentation = store.createPresentation({ projectId: project.id, title: '单页重新生成', outline: [{ title: 'Slide 1', points: ['Point'] }] })
    const paths: string[] = []
    const worker = new PresentationWorker(store, imageService(input => { paths.push(input.outputPath) }), 1)
    try {
      worker.generate(presentation.id)
      const ready = await waitReady(store, presentation.id)
      paths.length = 0
      const retried = await worker.retrySlide(presentation.id, ready.slides[0]!.id)
      expect(retried.status).toBe('ready')
      expect(paths).toEqual([expect.stringContaining('slide-01.png')])
      expect(retried.slides[0]?.visualAttempt).toBe(2)
    } finally {
      worker.dispose()
      store.close()
    }
  }, 15_000)

  it('patches and regenerates only the requested slide', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-ppt-page-update-'))
    roots.push(root)
    const store = new ResearchStore(join(root, 'research.db'))
    const project = store.createProject({ name: 'Test', rootPath: root })
    const outline = Array.from({ length: 3 }, (_, index) => ({ title: `Slide ${index + 1}`, points: [`Point ${index + 1}`] }))
    const presentation = store.createPresentation({ projectId: project.id, title: '单页修改', outline })
    const paths: string[] = []
    const worker = new PresentationWorker(store, imageService(input => { paths.push(input.outputPath) }), 1)
    try {
      worker.generate(presentation.id)
      const first = await waitReady(store, presentation.id)
      const untouched = first.slides.filter((_, index) => index !== 1).map(slide => ({ id: slide.id, checksum: slide.visual?.checksum, uri: slide.visualUri }))
      paths.length = 0
      const updated = await worker.updateSlide(presentation.id, first.slides[1]!.id, { title: '新标题', body: '- 新内容', notes: '演讲备注', visualPrompt: '仅更新第二页' })
      expect(updated.status).toBe('ready')
      expect(paths).toEqual([expect.stringContaining('slide-02.png')])
      expect(updated.slides[1]).toMatchObject({ title: '新标题', body: '- 新内容', notes: '演讲备注', visualPrompt: '仅更新第二页' })
      expect(updated.outline[1]).toMatchObject({ title: '新标题', points: ['新内容'] })
      expect(updated.slides.filter((_, index) => index !== 1).map(slide => ({ id: slide.id, checksum: slide.visual?.checksum, uri: slide.visualUri }))).toEqual(untouched)
      expect(updated.artifacts.map(item => item.kind)).toContain('pptx')
      expect(updated.artifacts.map(item => item.kind)).not.toContain('pdf')
    } finally {
      worker.dispose()
      store.close()
    }
  }, 15_000)

  it('rebuilds an image source into an editable PPTX with manifests', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-ppt-image-rebuild-'))
    roots.push(root)
    const store = new ResearchStore(join(root, 'research.db'))
    const project = store.createProject({ name: 'Test', rootPath: root })
    const imagePath = join(root, 'reference.png')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    await writeFile(imagePath, png)
    const presentation = store.createPresentation({ projectId: project.id, title: '图片重建', outline: [{ title: '第 1 页', points: [] }] })
    const worker = new PresentationWorker(store, 1)
    try {
      const rebuilt = await worker.rebuildEditable(presentation.id, undefined, '保持布局', 2, [{ path: imagePath, kind: 'image', checksum: createHash('sha256').update(png).digest('hex'), page: 1 }])
      expect(rebuilt.sourceMode).toBe('image-rebuild')
      expect(rebuilt.slides[0]?.editableStatus).toBe('ready')
      expect(rebuilt.artifacts.map(item => item.kind)).toEqual(expect.arrayContaining(['editable-pptx', 'scene-map', 'editable-manifest']))
      expect(existsSync(filePath(rebuilt.artifacts.find(item => item.kind === 'editable-pptx')!.uri))).toBe(true)
    } finally {
      worker.dispose()
      store.close()
    }
  }, 15_000)

  it('rebuilds only the referenced page as editable and preserves other pages', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-ppt-image-rebuild-single-'))
    roots.push(root)
    const store = new ResearchStore(join(root, 'research.db'))
    const project = store.createProject({ name: 'Test', rootPath: root })
    const presentation = store.createPresentation({ projectId: project.id, title: '单页可编辑重建', outline: [{ title: '一', points: ['a'] }, { title: '二', points: ['b'] }] })
    const worker = new PresentationWorker(store, 1)
    try {
      worker.generate(presentation.id)
      const first = await waitReady(store, presentation.id)
      const untouched = { id: first.slides[1]!.id, visualUri: first.slides[1]!.visualUri, visual: { checksum: first.slides[1]!.visual?.checksum } }
      const rebuilt = await worker.rebuildEditable(presentation.id, [first.slides[0]!.id], '仅转换引用页', 1)
      expect(rebuilt.status).toBe('ready')
      expect(rebuilt.slides[0]?.editableStatus).toBe('ready')
      expect(rebuilt.slides[1]).toMatchObject(untouched)
      expect(rebuilt.slides[1]?.editableStatus).toBeUndefined()
    } finally {
      worker.dispose()
      store.close()
    }
  }, 15_000)
})

async function waitReady(store: ResearchStore, id: string) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const value = store.getPresentation(id)
    if (value?.status === 'ready') return value
    if (value?.status === 'failed') throw new Error(value.error ?? 'generation failed')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('presentation generation timed out')
}

function filePath(uri: string): string {
  return decodeURIComponent(new URL(uri).pathname).replace(/^\/([A-Za-z]:)/u, '$1')
}

async function waitFailed(store: ResearchStore, id: string) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const value = store.getPresentation(id)
    if (value?.status === 'failed') return value
    if (value?.status === 'ready') throw new Error('presentation unexpectedly completed')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('presentation failure timed out')
}

function imageService(beforeWrite: (input: { outputPath: string; size?: string; quality?: string }) => void | Promise<void>, quality: 'auto' | 'low' | 'medium' | 'high' = 'medium'): ZeroWallImageGenerationService {
  const generate = async (input: { outputPath: string; size?: string; quality?: string }, cwd: string): Promise<GenerateImageResult> => {
    await beforeWrite(input)
    const path = join(cwd, input.outputPath)
    await mkdir(dirname(path), { recursive: true })
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    await writeFile(path, png)
    return { path, model: 'gpt-image-2', providerId: 'provider', groupId: 'group', bytes: png.byteLength, requestedSize: (input.size as GenerateImageResult['requestedSize']) ?? 'auto', actualWidth: 1, actualHeight: 1, quality, requestedQuality: quality, actualQuality: quality }
  }
  return {
    resolveModel: async () => ({ providerId: 'provider', groupId: 'group', modelId: 'gpt-image-2' }),
    resolveQuality: async () => quality,
    generate: generate as ZeroWallImageGenerationService['generate'],
    edit: generate as ZeroWallImageGenerationService['edit'],
  }
}
