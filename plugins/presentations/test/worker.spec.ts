import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ResearchStore } from '@zerowallscience/research-store'
import type { GenerateImageResult, ZeroWallImageGenerationService } from '@zerowallscience/plugin-images'
import { PresentationWorker } from '../src/host/worker.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('presentation generation', () => {
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
      expect(first.artifacts.map(item => item.kind).sort()).toEqual(['pdf', 'pptx'])
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
      const artifactUris = first.artifacts.filter(item => item.kind === 'pptx' || item.kind === 'pdf').map(item => item.uri).sort()
      const before = new Map([...slideUris, ...artifactUris].map(uri => [uri, readFileSync(filePath(uri))]))

      fail = true
      worker.generate(presentation.id)
      const failed = await waitFailed(store, presentation.id)
      expect(failed.error).toContain('injected visual failure')
      expect(failed.slides.map(slide => slide.visualUri)).toEqual(slideUris)
      expect(failed.artifacts.filter(item => item.kind === 'pptx' || item.kind === 'pdf').map(item => item.uri).sort()).toEqual(artifactUris)
      for (const [uri, bytes] of before) expect(readFileSync(filePath(uri))).toEqual(bytes)
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

function imageService(beforeWrite: () => void): ZeroWallImageGenerationService {
  const generate = async (input: { outputPath: string; size?: string }, cwd: string): Promise<GenerateImageResult> => {
    beforeWrite()
    const path = join(cwd, input.outputPath)
    await mkdir(dirname(path), { recursive: true })
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    await writeFile(path, png)
    return { path, model: 'gpt-image-2', providerId: 'provider', groupId: 'group', bytes: png.byteLength, requestedSize: (input.size as GenerateImageResult['requestedSize']) ?? 'auto', actualWidth: 1, actualHeight: 1, quality: 'medium', requestedQuality: 'medium', actualQuality: 'medium' }
  }
  return {
    resolveModel: async () => ({ providerId: 'provider', groupId: 'group', modelId: 'gpt-image-2' }),
    generate: generate as ZeroWallImageGenerationService['generate'],
    edit: generate as ZeroWallImageGenerationService['edit'],
  }
}
