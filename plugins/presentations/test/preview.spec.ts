import { mkdtempSync, rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ResearchStore } from '@zerowallscience/research-store'
import { readPresentationSlidePreview } from '../src/host/index.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('presentation slide preview', () => {
  it('recovers an existing stable slide image when an older slide record has no visual URI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-ppt-preview-'))
    roots.push(root)
    const store = new ResearchStore(join(root, 'research.db'))
    const project = store.createProject({ name: 'Preview', rootPath: root })
    const presentation = store.createPresentation({ projectId: project.id, title: 'Preview' })
    store.updatePresentation(presentation.id, { slides: [{ id: 'slide-1', title: 'Slide', body: '', assetUris: [] }] })
    const imagePath = join(root, '.zerowall', 'artifacts', 'presentations', presentation.id, 'visuals', 'slide-01.png')
    await mkdir(dirname(imagePath), { recursive: true })
    await writeFile(imagePath, Buffer.from('image bytes'))
    try {
      await expect(readPresentationSlidePreview(store, presentation.id, 'slide-1')).resolves.toMatchObject({
        mediaType: 'image/png', byteSize: 11, base64: Buffer.from('image bytes').toString('base64'),
      })
    } finally {
      store.close()
    }
  })
})
